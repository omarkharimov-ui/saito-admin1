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
import { ArrowLeft, User, Route, Wallet, MessageCircle, PauseCircle, CloudRain, Clock, MapPin, AlertTriangle } from '@/components/ui/saito-icons';
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
  /** 2026-09-26 (owner, Task 50): fee RPC in flight → shimmer "hesablayır…". */
  feeCalculating?: boolean;
  /** 2026-09-26 (owner, Task 55): live smart-surge badge (weather/peak). */
  surge?: { mult: number; reason: 'weather' | 'peak'; base: number } | null;
}

export default function CustomerPhasePanel({ mode, cart, zones, onUpdate, onZoneSelect, onBack, focusField, deliveryPaused, deliveryMinOrder, feeCalculating, surge }: CustomerPhasePanelProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();

  const [flashField, setFlashField] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 2026-09-26 (owner, Task 55): ADDRESS → KM auto (Nominatim geocode +
  // haversine from the venue). Owner: "unvan daxil edende hesablasın km
  // gedən yolu, sonra real qiymət desin; hardcoded olmasin, çox dinamik".
  // Manual KM input wins (kmManualRef) — the auto only fills when the
  // operator hasn't typed a distance.
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [geoKm, setGeoKm] = useState<number | null>(null);
  const [geoDisplay, setGeoDisplay] = useState<string>('');
  // precision 'area' = the street wasn't in OSM; the km is a city/area-level
  // estimate — the UI marks it "təxmini" so the operator can correct via KM.
  const [geoApprox, setGeoApprox] = useState(false);
  const kmManualRef = useRef(false);

  // ── 11t (owner: "google maps kimi davrananda olmaz??") — live suggest ──
  // Type → 600ms debounce → ALL matching OSM points (district in the name) →
  // tap one → EXACT point + KM. "20 yanvar" is ambiguous (several 20 Yanvar
  // streets in Bakı) — the list lets the operator pick, the old single
  // best-match geocode picked a district arbitrarily. Zone is NEVER
  // auto-selected by this.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestResults, setSuggestResults] = useState<{ name: string; lat: number; lng: number; km: number; type: string }[]>([]);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const suggestAbort = useRef<AbortController | null>(null);
  // 11t: the picked suggestion's full name — the suggest effect must NOT
  // re-query it (the full name is itself a Nominatim hit → the dropdown
  // re-opened with 1 row after a pick). Cleared on any manual keystroke.
  const suggestPickedRef = useRef<string | null>(null);

  // 11v (owner: "onlardan daha yaxşı olsun" — free OSRM, keyless): live
  // DRIVING time for the picked exact point. Competitors show a static zone
  // ETA ("20–30 dəq"); we show the real route minutes per address.
  // Non-blocking: the hint appears when the ETA arrives. (Named driveEta —
  // the 11q `eta` state above is the DYNAMIC kitchen ETA, a different thing.)
  const [driveEta, setDriveEta] = useState<{ km: number; minutes: number } | null>(null);
  const etaAbort = useRef<AbortController | null>(null);

  // 11q (owner, idea D: "mutfaktaki anlık yoğunluğa göre dinamik ETA"): the
  // promised ETA tracks the LIVE kitchen queue — zone base range + queued
  // items (all order types), capped. Re-fetched every 30s while a zone is
  // selected; the math is server-authoritative (estimate_delivery_eta RPC).
  const [eta, setEta] = useState<{ base_lo: number; base_hi: number; load: number; adjust: number; lo: number; hi: number } | null>(null);
  // NOTE: the zoneId lookup + refetch effect are declared BELOW, right after
  // `zoneName`. `const zoneName` is not value-hoisted — referencing it here
  // would throw "Cannot access 'zoneName' before initialization" (TDZ) and
  // crash the entire customer phase on open.

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
  // 11v: a new address (or mode) invalidates the driving-time hint.
  // (Declared HERE, not with the state above — `address` would be in its TDZ.)
  useEffect(() => {
    setDriveEta(null);
    etaAbort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, mode]);
  // 2026-09-28 (owner: "umumi inputlarda space qoymaq problemi"): the CONTROLLED
  // input `value` must be the RAW cart value, NOT a trimmed one. Feeding the
  // trimmed string back as `value` re-snaps the DOM after every re-render and
  // silently eats the just-typed trailing space (VKB "a b c" → "abc"). The
  // trimmed consts above are kept for logic (wa link, geocode, avatar, checks).
  const phoneRaw = cart?.customer_phone || '';
  const nameRaw = cart?.customer_name || '';
  const addressRaw = cart?.delivery_address || '';
  const zoneName = cart?.delivery_zone || '';
  const feeNum = Number(cart?.delivery_fee) || 0;

  // 11q: zone id for the dynamic-ETA effect. MUST live below zoneName (TDZ).
  const zoneId = zones.find(z => z.name === zoneName)?.id;
  useEffect(() => {
    if (mode !== 'delivery' || !zoneId) { setEta(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/rpc/estimate_delivery_eta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_zone_id: zoneId }),
        });
        const d = r.ok ? await r.json() : null;
        if (!cancelled && d && d.lo != null) setEta(d);
      } catch { /* silent — the zone base ETA still shows on the chip */ }
    };
    load();
    const iv = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [zoneId, mode]);

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
        // 2026-09-28 (owner: light mode — yalnız mavi/qara): flash = qara ring
        ? `bg-white ${flashField === f ? 'border-zinc-900 ring-2 ring-zinc-900/30' : 'border-zinc-200 focus:border-zinc-400'} text-zinc-900 placeholder:text-zinc-400`
        : `bg-white/[0.04] ${flashField === f ? 'border-amber-400/80 ring-2 ring-amber-400/25' : 'border-white/[0.10] focus:border-white/30'} text-white placeholder:text-white/25`
    }`;

  const labelCls = `text-[10px] font-black uppercase tracking-[0.14em] mb-1.5 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`;

  // (Task 55) address → km auto-resolve, debounced 1.2s. The page's
  // onUpdate('delivery_km', ...) handler already triggers the fee RPC
  // (distance overload) — so the fee follows the address automatically.
  useEffect(() => {
    if (mode !== 'delivery' || kmManualRef.current) { setGeoStatus('idle'); return; }
    const addr = address.trim();
    if (addr.length < 8) {
      setGeoStatus('idle'); setGeoKm(null); setGeoDisplay('');
      // 11s: address emptied → stale auto-KM goes with it (manual KM stays).
      if (!kmManualRef.current && cart && cart.delivery_km != null) onUpdate('delivery_km', null);
      return;
    }
    let cancelled = false;
    setGeoStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`, { cache: 'no-store' });
        const d = r.ok ? await r.json() : null;
        if (cancelled) return;
        // 11s (owner: "same-city tapilmadi" bug): km=0 is a VALID result —
        // street not in OSM → venue's own city centroid (customer ≈ venue
        // city). The old `km > 0` check rejected it as "not found".
        if (d && d.km != null && Number(d.km) >= 0) {
          setGeoStatus('ok');
          setGeoKm(Number(d.km));
          setGeoDisplay(d.display || addr);
          setGeoApprox(d.precision === 'area');
          if (Number(cart?.delivery_km || 0) !== Number(d.km)) onUpdate('delivery_km', Number(d.km));
        } else {
          setGeoStatus('fail');
          setGeoKm(null);
          setGeoApprox(false);
          // 11s: a failed geocode must not silently KEEP the previous
          // address's auto-filled KM (pre-fix repro: Test A 24.4 → Test B
          // fail → KM still 24.4). Manual KM (kmManualRef) is never touched.
          if (!kmManualRef.current && cart && cart.delivery_km != null) onUpdate('delivery_km', null);
        }
      } catch {
        if (!cancelled) { setGeoStatus('fail'); setGeoKm(null); }
      }
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, mode]);

  // 11t: Google-Maps-style live suggest (in-flight requests aborted).
  // 11u (owner: "2 yazsam birdən-birə olmalıdır"): min 1 xarakter; 1-2 char
  // = server-local prefix index (0 Nominatim call, ~1ms) → debounce 100ms;
  // 3+ char = Nominatim live → debounce 350ms. The single best-match geocode
  // effect above stays as the fallback for full addresses with no tap.
  useEffect(() => {
    if (mode !== 'delivery') { setSuggestOpen(false); setSuggestResults([]); return; }
    const addr = address.trim();
    if (addr.length < 1) { setSuggestOpen(false); setSuggestResults([]); return; }
    // Picked exact match → no re-suggest loop (see suggestPickedRef).
    if (addr === suggestPickedRef.current) { setSuggestOpen(false); setSuggestResults([]); return; }
    const delay = addr.length < 3 ? 100 : 350;
    let cancelled = false;
    const timer = setTimeout(async () => {
      suggestAbort.current?.abort();
      const ac = new AbortController();
      suggestAbort.current = ac;
      try {
        const r = await fetch(`/api/geocode/suggest?address=${encodeURIComponent(addr)}`, { cache: 'no-store', signal: ac.signal });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (cancelled) return;
        const list = Array.isArray(d?.results) ? d.results : [];
        setSuggestResults(list);
        setSuggestOpen(list.length > 0);
        setSuggestIndex(0);
      } catch { /* aborted / network — keep the previous list */ }
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, mode]);

  // 11t: operator tapped a suggestion → exact point + KM. NO zone side
  // effects: the zone chip stays the operator's explicit decision.
  const pickSuggest = (it: { name: string; lat: number; lng: number; km: number; type: string }) => {
    kmManualRef.current = false;
    suggestPickedRef.current = it.name;
    onUpdate('delivery_address', it.name);
    setGeoStatus('ok');
    setGeoKm(it.km);
    setGeoDisplay(it.name);
    setGeoApprox(false);
    setSuggestOpen(false);
    setSuggestResults([]);
    // 11v: the KM update drives AUTO zone selection in page.tsx (Toast model
    // — the address decides the zone; chips stay a manual override).
    if (Number(cart?.delivery_km ?? -1) !== it.km) onUpdate('delivery_km', it.km);
    // 11v: live driving time (OSRM, free) for this exact point — non-blocking;
    // competitors only show a static zone ETA ("20–30 dəq").
    etaAbort.current?.abort();
    const ac = new AbortController();
    etaAbort.current = ac;
    fetch(`/api/delivery-eta?lat=${it.lat}&lng=${it.lng}`, { cache: 'no-store', signal: ac.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!ac.signal.aborted && d && d.minutes) setDriveEta({ km: d.km, minutes: d.minutes }); })
      .catch(() => { /* OSRM down → hint shows km only (graceful) */ });
  };

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
                      value={nameRaw}
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
                        value={phoneRaw}
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
                  {/* 11v: out-of-radius warning — no zone auto-selected when
                      the distance is beyond every configured band (Toast:
                      "outside delivery area"); operator picks deliberately. */}
                  {(() => {
                    const maxBand = zones.length ? Math.max(...zones.map((zz: any) => zz.max_km ?? 0)) : 0;
                    const oob = geoKm != null && Number(geoKm) >= 0.1 && !zoneName && maxBand > 0 && Number(geoKm) > maxBand;
                    if (!oob) return null;
                    return (
                      <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold ${lightMode ? 'text-amber-600' : 'text-amber-400/90'}`}>
                        <AlertTriangle size={12} />
                        {geoKm} km — radius kənarında: zone-nu sən seç
                      </div>
                    );
                  })()}
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
                  <div className="relative">
                  <input
                     ref={el => { fieldRefs.current['delivery_address'] = el; }}
                     value={addressRaw}
                     onChange={e => { kmManualRef.current = false; suggestPickedRef.current = null; setField('delivery_address')(e); }}
                     onKeyDown={e => {
                       if (!suggestOpen || suggestResults.length === 0) return;
                       if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIndex(i => (i + 1) % suggestResults.length); }
                       else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIndex(i => (i - 1 + suggestResults.length) % suggestResults.length); }
                       else if (e.key === 'Enter') { e.preventDefault(); pickSuggest(suggestResults[suggestIndex]); }
                       else if (e.key === 'Escape') { e.preventDefault(); setSuggestOpen(false); }
                     }}
                     onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                    placeholder={t('address_placeholder')}
                    className={inputCls('delivery_address', 'h-12 text-base font-semibold')}
                  />
                  {/* 11t: Google-Maps-style suggest dropdown — every matching
                      point (district visible in the name) + venue→point KM.
                      Tap = exact selection; the list is how "20 Yanvar"
                      ambiguity gets resolved by the operator, not by luck. */}
                  {suggestOpen && suggestResults.length > 0 && (
                    <div className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-2xl border shadow-2xl overflow-hidden max-h-[280px] overflow-y-auto ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}>
                      {suggestResults.map((it, i) => (
                        <button
                          key={`${it.lat.toFixed(5)},${it.lng.toFixed(5)}`}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); pickSuggest(it); }}
                          onMouseEnter={() => setSuggestIndex(i)}
                          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs font-semibold transition-colors ${
                            i === suggestIndex
                              ? (lightMode ? 'bg-emerald-50 text-emerald-800' : 'bg-white/[0.06] text-white/90')
                              : (lightMode ? 'text-zinc-700' : 'text-white/70')
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                            i === suggestIndex
                              ? (lightMode ? 'bg-emerald-500 text-white' : 'bg-emerald-400 text-zinc-900')
                              : (lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/[0.06] text-white/40')
                          }`}>
                            <MapPin size={11} />
                          </span>
                          <span className="flex-1 min-w-0 leading-snug line-clamp-2">{it.name}</span>
                          <span className={`text-[10px] font-black tabular-nums flex-shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{it.km} km</span>
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                 {/* 2026-09-26 (Task 55): live distance hint — Nominatim +
                     haversine from the venue. loading = shimmer, ok = km,
                     fail = silent (manual KM stays available). */}
                 <style>{`
@keyframes vk-geo-shimmer { 0% { transform: translateX(-110%);} 100% { transform: translateX(260%);} }
.vk-geo-bar { position: relative; width: 56px; height: 7px; border-radius: 999px; overflow: hidden; background: ${lightMode ? 'rgba(16,165,129,0.12)' : 'rgba(16,185,129,0.14)'}; }
.vk-geo-bar::after { content: ''; position: absolute; top: 0; bottom: 0; width: 55%; border-radius: 999px; background: linear-gradient(90deg, transparent, ${lightMode ? 'rgba(5,150,105,0.75)' : 'rgba(52,211,153,0.9)'}, transparent); animation: vk-geo-shimmer 1.1s ease-in-out infinite; }
`}</style>
                 {geoStatus === 'loading' && (
                   <p className={`mt-1 flex items-center gap-2 text-[10px] font-bold ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
                     Məsafə hesablanır… <span className="vk-geo-bar" />
                   </p>
                 )}
                        {geoStatus === 'ok' && geoKm != null && (
                          <span className={`text-xs font-bold ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
                            {geoApprox ? '≈ ' : ''}{geoKm} km{geoApprox ? ' (təxmini)' : ''}
                            {/* 11v: live OSRM driving time — beats competitors' static zone ETA */}
                            {driveEta ? ` · ~${driveEta.minutes} dəq` : ''}
                            {' · '}{geoDisplay}
                          </span>
                        )}
                  {/* Geocode failed (address not in OSM) — point the operator
                      to the manual KM field so the fee can still be exact. */}
                  {/* 2026-09-28 (owner: light mode — yalnız mavi/qara) */}
                  {geoStatus === 'fail' && (
                    <p className={`mt-1 text-[10px] font-bold ${lightMode ? 'text-zinc-900' : 'text-amber-400/80'}`}>
                      Ünvan xəritədə tapılmadı — məsafəni KM sahəsinə əl ilə daxil edin
                    </p>
                  )}
               </div>

              {/* 2026-09-26 (owner, Task 50): Wolt-style distance field —
                  typing a km re-resolves the zone by its km-range and re-prices
                  the fee live (distance overload of calculate_delivery_fee). */}
              <div className="flex gap-3">
                 <div className="w-[86px] flex-shrink-0">
                   <p className={labelCls}>KM</p>
                   <input
                     type="number"
                     inputMode="decimal"
                     min={0}
                     step={0.5}
                      value={cart?.delivery_km ?? ''}
                      placeholder="0.0"
                      onChange={e => { kmManualRef.current = true; setGeoStatus('idle'); onUpdate('delivery_km', e.target.value === '' ? null : Number(e.target.value)); }}
                      className={`${inputCls('delivery_km', 'h-12 text-base font-semibold text-center')} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                    />
                 </div>
                 <div className="flex-1 min-w-0">
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
                          {/* 2026-09-26 (owner): iPhone-call-style shimmer sweep
                              while the fee RPC resolves ("hesablayır…"). */}
                          <style>{`
@keyframes vk-fee-shimmer { 0% { transform: translateX(-110%);} 100% { transform: translateX(260%);} }
.vk-fee-shimmer { position: relative; width: 72px; height: 10px; border-radius: 999px; overflow: hidden; background: ${lightMode ? 'rgba(16,165,129,0.12)' : 'rgba(16,185,129,0.14)'}; }
.vk-fee-shimmer::after { content: ''; position: absolute; top: 0; bottom: 0; width: 55%; border-radius: 999px; background: linear-gradient(90deg, transparent, ${lightMode ? 'rgba(5,150,105,0.75)' : 'rgba(52,211,153,0.9)'}, transparent); animation: vk-fee-shimmer 1.1s ease-in-out infinite; }
`}</style>
                          <div className={`h-12 rounded-2xl border flex items-center justify-between px-4 ${isFree ? (lightMode ? 'bg-emerald-50 border-emerald-300' : 'bg-emerald-500/10 border-emerald-500/30') : lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
                            <Wallet size={14} className={isFree ? 'text-emerald-500' : lightMode ? 'text-zinc-400' : 'text-white/35'} />
                            {/* 11t (owner: "zonanı ozu secir, men secmirem"):
                                until the operator taps a zone chip there is
                                NO fee — never show ₼0 (reads as "free"). */}
                            {!z ? (
                              <span className={`text-[11px] font-black uppercase tracking-wider ${lightMode ? 'text-amber-600' : 'text-amber-400/90'}`}>
                                Zone seçin
                              </span>
                            ) : feeCalculating ? (
                              <span className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
                                {t('calculating_fee' as any) || 'Hesablayır…'}
                                <span className="vk-fee-shimmer" />
                              </span>
                            ) : isFree ? (
                              <span className="text-sm font-black tabular-nums text-emerald-500">
                                {t('free') || 'Pulsuz'}
                                {threshold > 0 && itemsTotal >= threshold
                                  ? <span className="text-[10px] font-bold opacity-70"> (₼{threshold.toFixed(0)}+)</span>
                                  : <span className="text-[10px] font-bold opacity-70"> (kampaniya)</span>}
                              </span>
                            ) : (
                              <span className={`text-sm font-black tabular-nums ${lightMode ? 'text-zinc-700' : 'text-white/75'}`}>
                                ₼{Number.isInteger(feeNum) ? feeNum.toFixed(0) : feeNum.toFixed(2)}
                              </span>
                            )}
                           </div>
                           {/* 2026-09-26 (owner, Task 55): SMART-SURGE badge —
                               Wolt-class "yağış/pik" hint with the iPhone-call
                               glow sweep across the text (owner: "iphone-da
                               zeng gelende text uzerinde parlayib gedən
                               animation kimi"). Server-authoritative: the fee
                               above ALREADY includes the surge; this badge
                               explains WHY (reason + base fee). */}
                           {surge && feeNum > 0 && !isFree && (
                             <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                               <style>{`
@keyframes vk-surge-glow { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
.vk-surge-text { background-image: linear-gradient(110deg, ${lightMode ? '#18181B' : '#F59E0B'} 38%, ${lightMode ? '#52525B' : '#FDE68A'} 50%, ${lightMode ? '#18181B' : '#F59E0B'} 62%); background-size: 220% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: vk-surge-glow 1.6s linear infinite; }
`}</style>
                                {/* 2026-09-28 (owner: light mode — yalnız mavi/qara) */}
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                  lightMode ? 'bg-zinc-900/10 border-zinc-900/25 text-zinc-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                }`}>
                                 {surge.reason === 'weather' ? <CloudRain size={11} /> : <Clock size={11} />}
                                 <span className="vk-surge-text">
                                   {surge.reason === 'weather' ? 'Yağış · sürx' : 'Pik saat · sürx'} ×{surge.mult}
                                 </span>
                               </span>
                               {surge.base > 0 && (
                                 <span className={`text-[10px] font-bold ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                                   bazada ₼{Number.isInteger(surge.base) ? surge.base.toFixed(0) : surge.base.toFixed(2)}
                                 </span>
                               )}
                             </div>
                           )}
                            {!isFree && toFree > 0 && (
                             <p className={`mt-1 text-[10px] font-bold ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
                               ₼{toFree.toFixed(0)} daha əlavə et — çatdırılma pulsuz olar
                             </p>
                           )}
                           {/* 11q: DYNAMIC ETA — zone base (Settings→Çatdırılma)
                               + live kitchen queue (KDS). "28–40 dəq" instead of
                               a static "30" that ignores the 20 orders cooking. */}
                           {eta && (
                             <p className={`mt-1 flex items-center gap-1.5 text-[10px] font-black ${lightMode ? 'text-zinc-500' : 'text-white/45'}`}>
                               <Clock size={11} className={lightMode ? 'text-zinc-400' : 'text-white/30'} />
                               Təxmini çatdırılma: {eta.lo}–{eta.hi} dəq
                               {eta.adjust > 0 && (
                                 <span className={`font-bold ${lightMode ? 'text-amber-600' : 'text-amber-400/90'}`}>
                                   · mətbəx: {eta.load} aktiv sətir (+{eta.adjust} dəq)
                                 </span>
                               )}
                             </p>
                           )}
                           {/* 11q (owner: "ifadə daha aydın olmalıdır") — the old
                               "Min sifariş ₼15 — ₼15 daha əlavə edin" was cryptic
                               with an empty cart; now it states the rule and the
                               exact gap in one readable sentence. */}
                           {toMin > 0 && (
                             <p className={`mt-1 text-[10px] font-black ${lightMode ? 'text-red-500' : 'text-red-400'}`}>
                               Minimum sifariş məbləği ₼{minOrder.toFixed(0)}-dir — səbətə daha ₼{toMin.toFixed(0)}-lik məhsul əlavə edin
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
