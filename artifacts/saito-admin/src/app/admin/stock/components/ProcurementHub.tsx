'use client';

// 13i — "Tədarük" tab. Owner audit: the thin hub "Tədarükçülər" tab was a
// duplicate → suppliers live HERE (one surface). "Sifariş et" dead-link
// (old ?tab=procurement&ingredient=) is fixed: the suggestion CTA pre-selects
// the ingredient in the Order Guide below (autoSelectId) and scrolls.
//
// 4 sub-pills (max 1 level — no more tab-within-tab-within-tab):
//   Nə Alım · Faktura · Sifarişlər · Tədarükçülər

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, ShoppingCart, ArrowDownCircle,
} from '@/components/ui/saito-icons';
import { SPRING } from '@/lib/motion/system';
import type { StockSuggestion } from '@/types/inventory';
import TabHero from './TabHero';
import OrderGuideSection from './OrderGuideSection';
import InvoiceUploadSection from './InvoiceUploadSection';
import SuppliersSection from './SuppliersSection';
import PurchaseOrdersPage from '../../purchase-orders/purchase-orders-content';
import { ViewContent } from './ViewFrame';

const URG: Record<string, { label: string; cls: string; light: string }> = {
  critical: { label: 'Kritik', cls: 'bg-rose-500/15 border-rose-500/30 text-rose-400', light: 'bg-rose-500/10 border-rose-500/30 text-rose-600' },
  high:     { label: 'Yüksək', cls: 'bg-orange-500/15 border-orange-500/30 text-orange-400', light: 'bg-orange-500/10 border-orange-500/30 text-orange-600' },
  medium:   { label: 'Orta',   cls: 'bg-amber-500/15 border-amber-500/30 text-amber-400', light: 'bg-amber-500/10 border-amber-500/30 text-amber-600' },
  low:      { label: 'Aşağı',  cls: 'bg-blue-500/15 border-blue-500/30 text-blue-400', light: 'bg-blue-500/10 border-blue-500/30 text-blue-600' },
};

interface Props {
  sub: string;
  onSubChange: (s: string) => void;
  isElevated: boolean;
  lightMode: boolean;
  /** legacy deep-link ingredient id (old "Sifariş et" links) */
  deepIngredient?: string | null;
}

export default function ProcurementHub({ sub, onSubChange, isElevated, lightMode, deepIngredient }: Props) {
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSelect, setAutoSelect] = useState<string | null>(deepIngredient ?? null);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, nRes] = await Promise.all([
        fetch('/api/stock/suggestions'),
        fetch('/api/notifications?type=stock&limit=20').catch(() => null),
      ]);
      if (sRes.ok) setSuggestions((await sRes.json()).suggestions ?? []);
      if (nRes && nRes.ok) setNotifs(await nRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const criticalCount = suggestions.filter(s => s.urgency === 'critical').length;
  const estCost = suggestions.reduce((a, s) => a + (s.suggested_reorder_qty * s.avg_cost_per_unit || 0), 0);

  const hero = criticalCount > 0
    ? { tone: 'critical' as const, title: `${suggestions.length} xammal sifariş olunmalı`, sub: `Təxmini xərc ₼${estCost.toLocaleString('az', { maximumFractionDigits: 0 })} — Order Guide-da sətir seçib DRAFT PO yarat (auto-send YOX).` }
    : suggestions.length > 0
      ? { tone: 'warning' as const, title: `${suggestions.length} xammal limitə yaxınlaşıb`, sub: 'Hələ kritik deyil — Order Guide-dən izləyin.' }
      : { tone: 'ok' as const, title: 'Hazırki sifariş tələbi yoxdur', sub: 'Bütün xammallar par səviyyəsində və ya yuxarısındadır.' };

  const pills = [
    { id: 'buy', label: 'Nə Alım' },
    { id: 'invoice', label: 'Faktura' },
    ...(isElevated ? [{ id: 'orders', label: 'Sifarişlər' }] : []),
    { id: 'suppliers', label: 'Tədarükçülər' },
  ];

  return (
    <ViewContent id={`proc-${sub}`}>
      <div className="space-y-5">
        <TabHero tone={hero.tone} title={hero.title} sub={hero.sub} lightMode={lightMode} />

        {/* sub-pills (max 1 level) */}
        <div className="flex flex-wrap gap-1 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] p-1 w-fit">
          {pills.map(p => (
            <button key={p.id} onClick={() => onSubChange(p.id)}
              className={`relative px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors ${sub === p.id ? 'text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>
              {sub === p.id && <motion.span layoutId="proc-sub-pill" className="absolute inset-0 rounded-xl bg-[var(--theme-text)]" transition={SPRING} />}
              <span className="relative z-10">{p.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {sub === 'buy' && (
            <motion.div key="buy" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING} className="space-y-5">
              {loading && (
                <div className="flex items-center justify-center py-10 text-[var(--theme-text-muted)]">
                  <RefreshCw size={20} className="animate-spin" />
                </div>
              )}

              {/* auto-order notifications (13a: type='stock' feed) */}
              {!loading && notifs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Avto-sifariş Bildirişləri</p>
                  {notifs.map((n: any) => (
                    <div key={n.id} className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-emerald-500/[0.05] border border-emerald-500/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--theme-text)]">{n.title}</p>
                        <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5">{n.body}</p>
                        {n.data?.items?.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {n.data.items.map((item: any, idx: number) => (
                              <p key={idx} className="text-[11px] text-[var(--theme-text-muted)]">• {item.name}: {item.current_stock} {item.unit} (min: {item.min_stock_level || 0})</p>
                            ))}
                          </div>
                        )}
                      </div>
                      {n.data?.whatsapp_url && (
                        <a href={n.data.whatsapp_url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all active:scale-[0.97]">
                          WhatsApp
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* suggestions → one CTA each: preselect in the Order Guide below */}
              {!loading && suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Təklif Edilən Sifarişlər</p>
                    <button onClick={load} className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors">
                      <RefreshCw size={12} /> Yenilə
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {suggestions.map((s, i) => {
                      const u = URG[s.urgency] || URG.low;
                      return (
                        <motion.div key={s.ingredient_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                          className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 hover:border-[var(--theme-text)]/30 transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-2.5">
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-[var(--theme-text)] truncate">{s.ingredient_name}</h3>
                              <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5">
                                {s.current_stock} {s.unit} stokda{s.daily_consumption_rate ? ` • ${Number(s.daily_consumption_rate).toFixed(1)}/gün` : ''}
                              </p>
                            </div>
                            <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${lightMode ? u.light : u.cls}`}>{u.label}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-3 text-[11px] text-[var(--theme-text-muted)]">
                              <span>Tövsiyə: <b className="text-[var(--theme-text)] tabular-nums">{s.suggested_reorder_qty} {s.unit}</b></span>
                              {s.days_remaining != null && <span>Qalan: <b className="text-[var(--theme-text)] tabular-nums">{Math.max(0, Number(s.days_remaining)).toFixed(0)}g</b></span>}
                              <span>₼<b className="text-[var(--theme-text)] tabular-nums">{((s.suggested_reorder_qty * s.avg_cost_per_unit) || 0).toFixed(0)}</b></span>
                            </div>
                            <button
                              onClick={() => { setAutoSelect(s.ingredient_id); }}
                              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all active:scale-[0.97]"
                            >
                              <ArrowDownCircle size={13} /> Order Guide
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loading && suggestions.length === 0 && notifs.length === 0 && (
                <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] py-12 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)] mb-3">
                    <ShoppingCart size={22} />
                  </div>
                  <p className="text-sm font-bold text-[var(--theme-text)]">Sifariş tələbi yoxdur</p>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">Order Guide par səviyyəsinə düşən maddələri avtomatik göstərəcək.</p>
                </div>
              )}

              <OrderGuideSection autoSelectId={autoSelect} />
            </motion.div>
          )}

          {sub === 'invoice' && (
            <motion.div key="invoice" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <InvoiceUploadSection />
            </motion.div>
          )}

          {sub === 'orders' && isElevated && (
            <motion.div key="orders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <PurchaseOrdersPage />
            </motion.div>
          )}

          {sub === 'suppliers' && (
            <motion.div key="suppliers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <SuppliersSection />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ViewContent>
  );
}
