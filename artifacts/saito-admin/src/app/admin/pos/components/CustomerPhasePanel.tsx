'use client';

/**
 * CustomerPhasePanel — the "müşəri mərhəli" for takeaway/delivery.
 *
 * 2026-09-22 (owner, iterative design decision): customer info must NOT live
 * inside the cart — any info placed in the cart column shrinks the basket
 * and competes with it on a small POS screen. Instead the POS order view has
 * two PHASES sharing the big (left) area:
 *
 *   Phase 1 "Mallar"   — ProductGrid full-screen, cart at max size, zero info
 *   Phase 2 "Müşəri"   — this panel takes the grid's place (the grid is not
 *                         needed at that moment), cart stays UNTOUCHED on the
 *                         right (items + total always visible)
 *
 * The phase switch is a real morph (same container, spring 500/26 + fade).
 * Triggers: the "Müşəri" chip in the cart header, or send-validation
 * (missing name/phone/address) which enters the phase + focuses the field.
 *
 * Takeaway = light (name + phone + WA + note). Delivery = full order card:
 * zone chips with fee+ETA, address, fee, note. (CRM profile match lives in
 * the ActionSheet customer view — intentional separation.)
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Route, Wallet, MessageCircle, PauseCircle } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const SPRING = { type: 'spring', stiffness: 500, damping: 26 } as const;

interface Zone {
  id: string;
  name: string;
  fee: number | string;
  estimated_minutes?: number;
  free_delivery_threshold?: number | string;
  // Delivery Phase 1 (2026-09-24): km range + ETA range
  min_km?: number | null;
  max_km?: number | null;
  est_minutes_min?: number | null;
  est_minutes_max?: number | null;
  // Delivery Phase 2 (2026-09-24): per-zone min order (null/absent = global)
  min_order?: number | null;
}

/** "2–5 km" / "5 km+" — empty string when the range is the default 0–∞. */
function zoneKmLabel(z: Zone): string {
  const min = Number(z.min_km) || 0;
  const max = z.max_km === null || z.max_km === undefined ? null : Number(z.max_km);
  if (max === null) return min > 0 ? `${min} km+` : '';
  return `${min}–${max} km`;
}

/** "20–35" range or single value; falls back to legacy estimated_minutes. */
function zoneEtaLabel(z: Zone): string {
  const legacy = z.estimated_minutes ? Number(z.estimated_minutes) : null;
  const lo = z.est_minutes_min != null ? Number(z.est_minutes_min) : legacy;
  const hi = z.est_minutes_max != null ? Number(z.est_minutes_max) : legacy;
  if (lo == null) return '';
  return hi != null && hi !== lo ? `${lo}–${hi}` : String(lo);
}

interface CustomerPhasePanelProps {
  mode: 'delivery' | 'takeaway';
  cart: any;
  zones: Zone[];
  onUpdate: (field: string, value: string | number | null) => void;
  onZoneSelect: (zoneName: string) => void;
  onBack: () => void;
  /** Send-validation hook: { field, n } — focus that field + amber flash. */
  focusField: { field: string; n: number } | null;
  /** Delivery Phase 2 (2026-09-24): settings.delivery_accepting_orders=false. */
  deliveryPaused?: boolean;
  /** Delivery Phase 2: global min order (settings) — fallback for zone.min_order. */
  deliveryMinOrder?: number | null;
}

export default function CustomerPhasePanel({ mode, cart, zones, onUpdate, onZoneSelect, onBack, focusField, deliveryPaused, deliveryMinOrder }: CustomerPhasePanelProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();

  const [flashField, setFlashField] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Send-validation focus + flash.
  useEffect(() => {
    if (!focusField) return;
    setFlashField(focusField.field);
    const el = fieldRefs.current[focusField.field];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const id = window.setTimeout(() => setFlashField(null), 1500);
    return () => window.clearTimeout(id);
  }, [focusField]);

  const phone = (cart?.customer_phone || '').trim();
  const name = (cart?.customer_name || '').trim();
  const address = (cart?.delivery_address || '').trim();
  const zoneName = cart?.delivery_zone || '';
  const feeNum = Number(cart?.delivery_fee) || 0;

  // 2026-09-23 (owner): PROF vs CONTACT separation — this panel is ORDER
  // CONTACT INFO only (name/phone/address). CRM profile linking (per-letter
  // customer search, loyalty) lives in the ActionSheet customer view; the
  // two paths must not blur together.
  const setField = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(f, e.target.value);
  };

  const waLink = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}` : null;

  const inputCls = (f: string, extra = '') =>
    `w-full rounded-2xl border px-4 transition-all outline-none ${extra} ${
      lightMode
        ? `bg-white ${flashField === f ? 'border-amber-400 ring-2 ring-amber-300/40' : 'border-zinc-200 focus:border-zinc-400'} text-zinc-900 placeholder:text-zinc-400`
        : `bg-white/[0.04] ${flashField === f ? 'border-amber-400/80 ring-2 ring-amber-400/25' : 'border-white/[0.10] focus:border-white/30'} text-white placeholder:text-white/25`
    }`;

  const labelCls = `text-[10px] font-black uppercase tracking-[0.14em] mb-1.5 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Phase header */}
      <div className="flex items-center gap-3 flex-shrink-0 mb-5">
        <button
          onClick={onBack}
          className={`h-10 px-4 rounded-2xl flex items-center gap-2 text-sm font-bold border transition-all active:scale-[0.97] ${
            lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'bg-white/[0.04] border-white/[0.09] text-white/60 hover:bg-white/[0.07]'
          }`}
        >
          <ArrowLeft size={15} />
          {t('products')}
        </button>
        <div className={`text-xs font-black uppercase tracking-[0.18em] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
          {mode === 'delivery' ? t('delivery') : t('takeaway')} · {t('customer_info')}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className={`max-w-[560px] rounded-3xl border p-6 space-y-5 ${lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.08]'}`}>

          {/* Delivery Phase 2: live pause banner (settings.delivery_accepting_orders=false) */}
          {mode === 'delivery' && deliveryPaused && (
            <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${
              lightMode ? 'bg-red-50 border-red-200 text-red-600' : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              <PauseCircle size={15} />
              <span className="text-xs font-black">Çatdırılma sifarişləri hazırda qəbul edilmir</span>
            </div>
          )}

          {/* Identity: avatar + name + phone */}
          <div>
            <div className="flex items-start gap-4">
              <motion.div
                layout
                transition={SPRING}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black flex-shrink-0 ${
                  name
                    ? (lightMode ? 'bg-blue-50 text-blue-500 border border-blue-200' : 'bg-blue-500/15 text-blue-300 border border-blue-400/20')
                    : (lightMode ? 'bg-zinc-50 border-2 border-dashed border-zinc-300 text-zinc-300' : 'bg-white/[0.02] border-2 border-dashed border-white/15 text-white/25')
                }`}
              >
                {name ? name.slice(0, 1).toUpperCase() : <User size={20} strokeWidth={1.8} />}
              </motion.div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex flex-col gap-2.5">
                  <div>
                    <p className={labelCls}>{t('customer_name')}</p>
                    <input
                      ref={el => { fieldRefs.current['customer_name'] = el; }}
                      value={name}
                      onChange={setField('customer_name')}
                      placeholder={mode === 'takeaway' ? t('cph_name_required') : t('customer_name_placeholder')}
                      className={inputCls('customer_name', 'h-11 text-base font-bold')}
                    />
                  </div>
                  <div className="relative">
                    <p className={labelCls}>{t('customer_phone')}</p>
                    <div className="flex gap-2">
                      <input
                        ref={el => { fieldRefs.current['customer_phone'] = el; }}
                        value={phone}
                        onChange={setField('customer_phone')}
                        placeholder="+994 50 123 45 67"
                        type="tel"
                        className={inputCls('customer_phone', 'h-11 text-base font-semibold flex-1')}
                      />
                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          title="WhatsApp"
                          className={`h-11 w-11 flex-shrink-0 rounded-2xl flex items-center justify-center border transition-all active:scale-[0.95] ${
                            lightMode ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100' : 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300 hover:bg-emerald-500/20'
                          }`}
                        >
                          <MessageCircle size={18} />
                        </a>
                      )}
                    </div>
               {mode === 'delivery' ? (
                 <>
               {zones.length > 0 && (
                <div>
                  <p className={labelCls}>{t('delivery_zone')}</p>
                  <div className="flex flex-wrap gap-2">
                    {zones.map(z => {
                      const on = zoneName === z.name;
                      return (
                        <motion.button
                          key={z.id}
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          transition={SPRING}
                          onClick={() => onZoneSelect(z.name)}
                          className={`h-10 px-4 rounded-2xl flex items-center gap-2 text-xs font-bold border transition-all ${
                            on
                              ? (lightMode ? 'bg-zinc-900 border-zinc-900 text-white shadow' : 'bg-white border-white text-zinc-900 shadow')
                              : (lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300' : 'bg-white/[0.03] border-white/[0.10] text-white/50 hover:border-white/25')
                          }`}
                        >
                          <Route size={13} className={on ? (lightMode ? 'text-white' : 'text-zinc-900') : (lightMode ? 'text-zinc-400' : 'text-white/35')} />
                          {z.name}
                          {zoneKmLabel(z) && (
                            <span className={`text-[10px] font-black ${on ? 'opacity-70' : 'opacity-45'}`}>{zoneKmLabel(z)}</span>
                          )}
                          <span className={`font-black ${on ? (lightMode ? 'text-white' : 'text-zinc-900') : (lightMode ? 'text-zinc-500' : 'text-white/60')}`}>₼{Number(z.fee).toFixed(0)}</span>
                          {zoneEtaLabel(z) ? <span className={on ? 'opacity-70' : 'opacity-50'}>· {zoneEtaLabel(z)} {t('min_short') || 'dəq'}</span> : null}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Address */}
              <div>
                <p className={labelCls}>{t('delivery_address')} *</p>
                <input
                  ref={el => { fieldRefs.current['delivery_address'] = el; }}
                  value={address}
                  onChange={setField('delivery_address')}
                  placeholder={t('address_placeholder')}
                  className={inputCls('delivery_address', 'h-12 text-base font-semibold')}
                />
              </div>

              {/* Fee + note */}
              <div className="flex gap-3">
                 <div className="w-[150px] flex-shrink-0">
                   <p className={labelCls}>{t('delivery_fee')}</p>
                   {/* 2026-09-23 (owner): free-delivery is now VISIBLE — the
                       zone's threshold (₼50+) and campaign free delivery
                       zero the fee, and the panel says so explicitly. */}
                   {(() => {
                      const z = zones.find(x => x.name === zoneName);
                      const itemsTotal = (cart?.items || []).reduce((s: number, i: any) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0);
                      const threshold = Number(z?.free_delivery_threshold) || 0;
                      const toFree = threshold > 0 ? Math.max(0, threshold - itemsTotal) : 0;
                      // Delivery Phase 2: min order (zone value first, global
                      // settings fallback) — mirrors the server gate in
                      // /api/orders (DELIVERY_MIN_ORDER).
                      const zMinRaw = z?.min_order != null ? Number(z.min_order) : 0;
                      const minOrder = zMinRaw > 0 ? zMinRaw : (deliveryMinOrder != null ? Number(deliveryMinOrder) : 0);
                      const toMin = minOrder > 0 ? Math.max(0, minOrder - itemsTotal) : 0;
                      const isFree = feeNum === 0 && !!z;
                     return (
                       <>
                         <div className={`h-12 rounded-2xl border flex items-center justify-between px-4 ${isFree ? (lightMode ? 'bg-emerald-50 border-emerald-300' : 'bg-emerald-500/10 border-emerald-500/30') : lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
                           <Wallet size={14} className={isFree ? 'text-emerald-500' : lightMode ? 'text-zinc-400' : 'text-white/35'} />
                           {isFree ? (
                             <span className="text-sm font-black tabular-nums text-emerald-500">
                               {t('free') || 'Pulsuz'}
                               {threshold > 0 && itemsTotal >= threshold
                                 ? <span className="text-[10px] font-bold opacity-70"> (₼{threshold.toFixed(0)}+)</span>
                                 : <span className="text-[10px] font-bold opacity-70"> (kampaniya)</span>}
                             </span>
                           ) : (
                             <span className={`text-sm font-black tabular-nums ${lightMode ? 'text-zinc-700' : 'text-white/75'}`}>
                               ₼{feeNum.toFixed(0)}
                             </span>
                           )}
                         </div>
                          {!isFree && toFree > 0 && (
                            <p className={`mt-1 text-[10px] font-bold ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
                              ₼{toFree.toFixed(0)} daha əlavə et — çatdırılma pulsuz olar
                            </p>
                          )}
                          {toMin > 0 && (
                            <p className={`mt-1 text-[10px] font-black ${lightMode ? 'text-red-500' : 'text-red-400'}`}>
                              Min sifariş ₼{minOrder.toFixed(0)} — ₼{toMin.toFixed(0)} daha əlavə edin
                            </p>
                          )}
                        </>
                     );
                   })()}
                 </div>
                <div className="flex-1 min-w-0">
                  <p className={labelCls}>{t('notes')}</p>
                  <input
                    ref={el => { fieldRefs.current['notes'] = el; }}
                    value={cart?.notes || ''}
                    onChange={setField('notes')}
                    placeholder={t('note_placeholder')}
                    className={inputCls('notes', 'h-12 text-sm')}
                  />
                </div>
               </div>
                 </>
               ) : (
            /* Takeaway: keep it light — name + phone (+ WA) is the job */
            <div>
              <p className={labelCls}>{t('notes')}</p>
              <input
                ref={el => { fieldRefs.current['notes'] = el; }}
                value={cart?.notes || ''}
                onChange={setField('notes')}
                placeholder={t('note_placeholder')}
                className={inputCls('notes', 'h-11 text-sm')}
              />
             </div>
               )}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
