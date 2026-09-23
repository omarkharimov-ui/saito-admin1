'use client';

/**
 * BDS — Delivery / Takeaway operations board (separate route, /admin/bds).
 *
 * 2026-09-23 (owner): status ownership is split by domain, one screen per
 * owner:
 *   KITCHEN statuses (preparing/ready)  -> pressed in KDS only (read-only here)
 *   DELIVERY/TAKEAWAY statuses (courier side: picked_up -> in_transit ->
 *   delivered; takeaway handover)       -> pressed HERE (BDS only)
 *
 * Buttons are machine-driven: the valid transitions come from
 * /api/rpc/get_valid_transitions (entity='delivery') — nothing hardcoded.
 * Station split (station_id, built 2026-09-22) is shown per order: which
 * station has how many items and whether that station's items are ready.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bike, ShoppingBag, Phone, MapPin, Wallet, CheckCircle2, Clock, User, ChefHat, PackageCheck, Navigation, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/api-fetch';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const SPRING = { type: 'spring', stiffness: 500, damping: 26 } as const;
const POLL_MS = 5000;

interface Station { id: string; name: string; station_type?: string; }
interface BdsStation { id: string; name: string; station_type: 'delivery' | 'pickup'; }
interface BdItem { id: string; name: string; quantity: number; kitchen_status: string; station_id: string | null; }
interface BdOrder {
  id: string;
  order_source: string;
  bds_station_id?: string | null;
  order_number: string | null;
  status: string;
  kitchen_status: string | null;
  delivery_status: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_zone?: string | null;
  delivery_fee?: number | string;
  courier_name?: string | null;
  total_amount: number | string;
  created_at: string;
  order_items?: BdItem[];
}

const DELIVERY_DONE = ['delivered', 'cancelled'];
// 'paid' is a PAYMENT state, not a fulfillment state: a paid delivery is still
// in transit until delivery_status = 'delivered'; a paid takeaway is still
// waiting handover until status = 'served'. Excluding 'paid' here would hide
// exactly the orders the board exists for (2026-09-23 E2E: paid delivery
// orders vanished from the Çatdırılma tab).
const ORDER_DEAD = ['cancelled', 'closed', 'refunded', 'partially_refunded', 'voided'];

// Courier-side statuses (BDS-owned). Kitchen-side (preparing/ready) are
// filtered out: they are pressed in the KDS.
const BDS_OWNED: Record<string, { icon: any; key: 'bds_picked_up' | 'bds_in_transit' | 'bds_delivered' }> = {
  picked_up: { icon: PackageCheck, key: 'bds_picked_up' },
  in_transit: { icon: Navigation, key: 'bds_in_transit' },
  delivered: { icon: Flag, key: 'bds_delivered' },
};

export default function BDSPage() {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  // 2026-09-23 (owner, station model): board tabs are STATIONS — SSOT:
  // stations.station_type IN ('delivery','pickup'). Every BDS order carries
  // bds_station_id (DB trigger + backfill). Legacy hardcoded tabs are only
  // a fallback if the kind=bds fetch fails / no stations are seeded.
  const [bdsStations, setBdsStations] = useState<BdsStation[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [orders, setOrders] = useState<BdOrder[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch('/api/stations?kind=kitchen').then(r => r.ok ? r.json() : []).then((d: any) => setStations(Array.isArray(d) ? d : [])).catch(() => setStations([]));
    apiFetch('/api/stations?kind=bds').then(r => r.ok ? r.json() : []).then((d: any) => setBdsStations(Array.isArray(d) ? (d as BdsStation[]) : [])).catch(() => setBdsStations([]));
  }, []);

  const fetchBds = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders');
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders || []);
    } catch { /* poll: ignore transient */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBds();
    tickRef.current = setInterval(fetchBds, POLL_MS);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [fetchBds]);

  const stationName = (sid: string | null | undefined) => {
    const fallback = stations.find(s => s.name === 'Main Kitchen')?.id || stations[0]?.id;
    return stations.find(s => s.id === (sid || fallback))?.name || 'Main Kitchen';
  };

  const isActiveByType: Record<string, (o: BdOrder) => boolean> = {
    delivery: (o) =>
      o.order_source === 'delivery'
      && !ORDER_DEAD.includes(o.status)
      && !DELIVERY_DONE.includes(o.delivery_status || ''),
    pickup: (o) =>
      o.order_source === 'takeaway'
      && !ORDER_DEAD.includes(o.status)
      && o.status !== 'served',
  };
  // Tab list = BDS stations (data-driven); legacy hardcoded tabs as fallback.
  const tabList: { id: string; label: string; station_type: string; icon: any }[] =
    bdsStations.length > 0
      ? bdsStations.map(s => ({ id: s.id, label: s.name, station_type: s.station_type, icon: s.station_type === 'delivery' ? Bike : ShoppingBag }))
      : [
          { id: '__delivery', label: t('bds_tab_delivery'), station_type: 'delivery', icon: Bike },
          { id: '__takeaway', label: t('bds_tab_takeaway'), station_type: 'pickup', icon: ShoppingBag },
        ];
  const activeTab = tabList.find(x => x.id === selectedTabId)
    || tabList.find(x => x.station_type === 'delivery')
    || tabList[0]
    || null;
  const isDeliveryTab = activeTab?.station_type === 'delivery';
  const board = activeTab
    ? orders.filter(o =>
        (isActiveByType[activeTab.station_type] || (() => false))(o)
        // '__' fallback tabs predate station ids: match by family only.
        && (activeTab.id.startsWith('__') || o.bds_station_id == null || o.bds_station_id === activeTab.id))
    : []
  ;
  board.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const elapsed = (iso: string) => {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  };

  const doDeliveryTransition = async (o: BdOrder, to: string) => {
    setBusyId(o.id);
    try {
      const res = await apiFetch('/api/rpc/transition_delivery_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_order_id: o.id,
          p_new_status: to,
          p_courier_id: null,
          p_courier_name: o.courier_name || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Transition failed');
      toast.success(`${t(BDS_OWNED[to].key)} — #${o.order_number || o.id.slice(-4).toUpperCase()}`);
      fetchBds();
    } catch (e: any) {
      toast.error(e?.message || t('error_occurred'));
    } finally {
      setBusyId(null);
    }
  };

  const doTakeawayHandover = async (o: BdOrder) => {
    setBusyId(o.id);
    try {
      const res = await apiFetch('/api/rpc/transition_order_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: o.id, p_new_status: 'served', p_reason: 'takeaway handover (BDS)' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Transition failed');
      toast.success(`${t('handover_done')} — #${o.order_number || o.id.slice(-4).toUpperCase()}`);
      fetchBds();
    } catch (e: any) {
      toast.error(e?.message || t('error_occurred'));
    } finally {
      setBusyId(null);
    }
  };

  /** Machine-driven buttons: fetch valid transitions for the order's
      delivery_status and keep only the BDS-owned (courier side) ones. */
  const [transitions, setTransitions] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const seen = Array.from(new Set(board.map(o => o.delivery_status || 'confirmed'))).filter(Boolean);
    let live = true;
    (async () => {
      for (const st of seen) {
        try {
          const res = await apiFetch('/api/rpc/get_valid_transitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_entity: 'delivery', p_current_status: st }),
          });
          if (res.ok) {
            const d = await res.json();
            if (live) setTransitions(prev => ({ ...prev, [st]: (d.transitions || []).map((x: any) => x.to_status) }));
          }
        } catch { /* keep previous */ }
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.map(o => o.delivery_status).join(',')]);

  // 'completed' counts as ready — same rule as KDSView (isItemReady); without
  // it the ALINDI / TƏHVİL ET buttons stayed disabled on finished orders
  // (2026-09-23 E2E).
  const kitchenReady = (o: BdOrder) => o.kitchen_status === 'ready' || o.kitchen_status === 'completed'
    || (o.kitchen_status === 'partially_ready' && (o.order_items || []).length > 0 && (o.order_items || []).every(i => ['ready', 'completed'].includes(i.kitchen_status)));

  const KITCHEN_LABEL: Record<string, { key: string; cls: string }> = {
    pending: { key: 'bds_k_pending', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
    preparing: { key: 'bds_k_preparing', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    ready: { key: 'bds_k_ready', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    partially_ready: { key: 'bds_k_partially', cls: 'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20' },
    completed: { key: 'bds_k_done', cls: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/15' },
  };

  const btnBase = `h-9 px-3.5 rounded-2xl text-[11px] font-black tracking-wide flex items-center justify-center gap-1.5 border transition-all active:scale-[0.97]`;
  const btnDisabled = lightMode ? `${btnBase} bg-zinc-100 text-zinc-300 border-zinc-200 cursor-not-allowed` : `${btnBase} bg-white/[0.03] text-white/20 border-white/[0.06] cursor-not-allowed`;
  const btnPrimary = lightMode ? `${btnBase} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 shadow` : `${btnBase} bg-emerald-500 text-zinc-950 border-emerald-400 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20`;
  const btnNeutral = lightMode ? `${btnBase} bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50` : `${btnBase} bg-white/[0.05] text-white/70 border-white/[0.12] hover:bg-white/[0.09]`;

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden ${lightMode ? 'bg-zinc-100' : 'bg-[#07070b]'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-3 border-b flex-shrink-0 ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/[0.02] border-white/[0.07]'}`}>
        <div>
          <h1 className={`text-lg font-black tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{t('bds_title')}</h1>
          <p className={`text-[11px] ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{t('bds_subtitle')}</p>
        </div>
        <div className={`flex p-1 rounded-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/[0.03] border-white/[0.08]'}`}>
          {tabList.map(tb => {
            const Icon = tb.icon;
            const on = tb.id === activeTab?.id;
            return (
              <button
                key={tb.id}
                onClick={() => setSelectedTabId(tb.id)}
                className={`h-9 px-4 rounded-xl flex items-center gap-2 text-xs font-black transition-all ${
                  on
                    ? (lightMode ? 'bg-zinc-900 text-white shadow' : 'bg-white text-zinc-950 shadow')
                    : (lightMode ? 'text-zinc-400 hover:text-zinc-600' : 'text-white/40 hover:text-white/70')
                }`}
              >
                <Icon size={14} />
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Clock size={22} className={lightMode ? 'text-zinc-300 animate-pulse' : 'text-white/20 animate-pulse'} />
          </div>
        ) : board.length === 0 ? (
          <div className={`h-full flex flex-col items-center justify-center gap-2 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
            <CheckCircle2 size={36} className="opacity-40" />
            <p className="text-sm font-semibold">{t('bds_empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-[1500px] mx-auto">
            <AnimatePresence>
              {board.map(o => {
                const orderNo = (String(o.order_number || '').replace(/[^0-9]/g, '')) || String(o.id).slice(-4).toUpperCase();
                const kLabel = KITCHEN_LABEL[o.kitchen_status || 'pending'] || KITCHEN_LABEL.pending;
                const kReady = kitchenReady(o);
                const valid = transitions[o.delivery_status || 'confirmed'] || [];
                const bdsButtons = valid.filter(s => BDS_OWNED[s]);
                // Station split: group items by station, ready = all items at station ready.
                const stGroups: Record<string, { qty: number; ready: number }> = {};
                for (const it of (o.order_items || [])) {
                  if (it.quantity <= 0 || ['completed', 'cancelled', 'voided'].includes(it.kitchen_status)) continue;
                  const nm = stationName(it.station_id);
                  stGroups[nm] = stGroups[nm] || { qty: 0, ready: 0 };
                  stGroups[nm].qty += it.quantity;
                  if (['ready', 'completed'].includes(it.kitchen_status)) stGroups[nm].ready += it.quantity;
                }
                const stEntries = Object.entries(stGroups);
                const taken = !isDeliveryTab && o.status === 'served';
                return (
                  <motion.div
                    key={o.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={SPRING}
                    className={`rounded-3xl border p-4 flex flex-col gap-3 ${
                      taken
                        ? (lightMode ? 'bg-white border-zinc-200 opacity-70' : 'bg-white/[0.015] border-white/[0.06] opacity-70')
                        : (kReady && !isDeliveryTab
                          ? (lightMode ? 'bg-emerald-50/60 border-emerald-200' : 'bg-emerald-500/[0.04] border-emerald-500/25')
                          : (lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.08]'))
                    }`}
                  >
                    {/* Title row — rule: "Çatdırılma #XXXX" / "Gel-Al #XXXX" */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isDeliveryTab
                          ? <Bike size={15} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />
                          : <ShoppingBag size={15} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />}
                        <span className={`text-sm font-black tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                          {isDeliveryTab ? t('delivery_short') : t('takeaway_short')}
                        </span>
                        <span className={`text-sm font-black tabular-nums ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{orderNo}</span>
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums flex items-center gap-1 shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                        <Clock size={11} />
                        {elapsed(o.created_at)}
                      </span>
                    </div>

                    {/* Customer */}
                    <div className="flex items-center gap-2 min-w-0">
                      <User size={12} className={lightMode ? 'text-zinc-300' : 'text-white/25'} />
                      <span className={`text-xs font-bold truncate ${lightMode ? 'text-zinc-700' : 'text-white/70'}`}>{o.customer_name || '—'}</span>
                      {o.customer_phone && (
                        <a href={`tel:${o.customer_phone}`} className={`ml-auto flex items-center gap-1 text-[11px] font-bold tabular-nums shrink-0 ${lightMode ? 'text-blue-500' : 'text-blue-300'}`}>
                          <Phone size={11} />
                          {o.customer_phone}
                        </a>
                      )}
                    </div>

                    {/* Delivery: address + zone + fee */}
                    {isDeliveryTab && (o.delivery_address || o.delivery_zone) && (
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="flex items-center gap-1 text-[11px] min-w-0 truncate">
                          <MapPin size={11} className={lightMode ? 'text-zinc-300' : 'text-white/25'} />
                          <span className={`font-semibold truncate ${lightMode ? 'text-zinc-600' : 'text-white/55'}`}>{o.delivery_address || '—'}</span>
                        </span>
                        {o.delivery_zone && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${lightMode ? 'bg-purple-50 text-purple-500 border-purple-200' : 'bg-purple-500/10 text-purple-300 border-purple-400/20'}`}>{o.delivery_zone}</span>}
                        {Number(o.delivery_fee) > 0 && <span className={`flex items-center gap-1 text-[10px] font-black ${lightMode ? 'text-amber-500' : 'text-amber-300'}`}><Wallet size={10} />₼{Number(o.delivery_fee).toFixed(0)}</span>}
                      </div>
                    )}

                    {/* Station split (station_id) — read-only kitchen view */}
                    {stEntries.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {stEntries.map(([nm, g]) => {
                          const done = g.ready >= g.qty;
                          return (
                            <span key={nm} className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${
                              done
                                ? (lightMode ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25')
                                : (lightMode ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-amber-500/10 text-amber-300 border-amber-500/20')
                            }`}>
                              <ChefHat size={10} />
                              {nm} · {g.ready}/{g.qty}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Kitchen status — READ-ONLY (owned by KDS) */}
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${lightMode ? kLabel.cls : kLabel.cls}`}>
                        {t(kLabel.key as any)}
                      </span>
                      <span className={`text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded-md border ${lightMode ? 'text-zinc-400 border-zinc-200 bg-zinc-50' : 'text-white/30 border-white/[0.08] bg-white/[0.03]'}`}>
                        KDS
                      </span>
                      {!kReady && !isDeliveryTab && <span className={`text-[10px] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('bds_waiting_kitchen')}</span>}
                    </div>

                    {/* BDS-owned actions (courier side / handover) */}
                    <div className="flex items-center gap-2 mt-auto flex-wrap">
                      {isDeliveryTab ? (
                        bdsButtons.length === 0 ? (
                          <span className={`text-[10px] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                            {!kReady ? t('bds_waiting_kitchen') : o.courier_name ? `${t('bds_courier')}: ${o.courier_name}` : t('bds_no_action')}
                          </span>
                        ) : bdsButtons.map(s => {
                          const meta = BDS_OWNED[s];
                          const Icon = meta.icon;
                          const disabled = (s === 'picked_up' && !kReady) || busyId === o.id;
                          return (
                            <button
                              key={s}
                              disabled={disabled}
                              onClick={() => doDeliveryTransition(o, s)}
                              title={s === 'picked_up' && !kReady ? t('bds_kitchen_not_ready') : undefined}
                              className={`${s === 'delivered' ? btnPrimary : btnNeutral} ${disabled ? btnDisabled : ''}`}
                            >
                              <Icon size={13} />
                              {t(meta.key as any)}
                            </button>
                          );
                        })
                      ) : (
                        taken ? (
                          <span className={`flex items-center gap-1.5 text-[10px] font-black ${lightMode ? 'text-emerald-500' : 'text-emerald-400'}`}>
                            <CheckCircle2 size={12} /> {t('bds_handed_over')}
                          </span>
                        ) : (
                          <button
                            disabled={!kReady || busyId === o.id}
                            onClick={() => doTakeawayHandover(o)}
                            title={!kReady ? t('bds_kitchen_not_ready') : undefined}
                            className={kReady ? btnPrimary : btnDisabled}
                          >
                            <PackageCheck size={13} />
                            {t('bds_handover')}
                          </button>
                        )
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
