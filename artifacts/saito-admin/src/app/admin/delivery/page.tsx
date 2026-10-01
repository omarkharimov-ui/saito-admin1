'use client';

/**
 * Delivery / Takeaway operations board (route: /admin/delivery).
 * 2026-09-24 (owner clarification): /admin/bds is now the BAR Display
 * (coffee/shakes station board = KDSView with stationType='bar'); this
 * board moved here — the route the delivery Phase 2 plan always specified.
 * (Created 2026-09-23 as /admin/bds — see git history.)
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
import { Bike, ShoppingBag, Phone, MapPin, Wallet, CheckCircle2, Clock, User, ChefHat, PackageCheck, Navigation, Flag, LayoutGrid, Utensils, PauseCircle } from '@/components/ui/saito-icons';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/api-fetch';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useCrossTableRefresh } from '@/hooks/useCrossTableRefresh';

const SPRING = { type: 'spring', stiffness: 500, damping: 26 } as const;
const POLL_MS = 5000;
// 2026-10-02 (12e, owner BDS review B1): the board showed 47-day-old
// GÖZLƏYİR zombies (86 non-terminal orders >7 days old in the dev DB).
// A dispatcher needs the current operation: >24h orders drop off (DB untouched).
const BDS_STALE_MS = 24 * 60 * 60 * 1000;

interface Station { id: string; name: string; station_type?: string; }
interface BdsStation { id: string; name: string; station_type: 'delivery' | 'pickup'; }
interface BdItem { id: string; name: string; quantity: number; kitchen_status: string; station_id: string | null; }
interface BdOrder {
  id: string;
  order_source: string;
  table_number?: number | null;
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
  estimated_delivery_time?: string | null;
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

  // 2026-09-23 (owner): couriers are real staff records (role 'courier',
  // managed on the Staff page). The board assigns one to a delivery order —
  // courier_id (staff FK) + courier_name, never free text.
  const [couriers, setCouriers] = useState<{ id: string; name: string }[]>([]);
  const [courierPickerFor, setCourierPickerFor] = useState<string | null>(null);

  // Delivery Phase 2 (2026-09-24): live accepting-pause — state comes from
  // the /api/orders poll (delivery.accepting), so it tracks Settings changes
  // made anywhere without an extra endpoint.
  const [deliveryAccepting, setDeliveryAccepting] = useState(true);
  const [togglingDelivery, setTogglingDelivery] = useState(false);
  const toggleDeliveryAccepting = async () => {
    if (togglingDelivery) return;
    if (deliveryAccepting && !window.confirm(t('bds_pause_confirm') || 'Çatdırılma sifarişlərinin qəbulunu dayandırsın?')) return;
    setTogglingDelivery(true);
    try {
      const res = await apiFetch('/api/settings/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ general: { delivery_accepting_orders: !deliveryAccepting } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'Update failed');
      const now = !deliveryAccepting;
      setDeliveryAccepting(now);
      toast.success(now ? (t('bds_delivery_active') || 'Çatdırılma aktiv') : (t('bds_delivery_paused') || 'Qəbul dayandırılıb'));
    } catch (e: any) {
      toast.error(e?.message || t('error_occurred'));
    } finally {
      setTogglingDelivery(false);
    }
  };
  useEffect(() => {
    apiFetch('/api/staff')
      .then(r => (r.ok ? r.json() : []))
      .then((d: any) => {
        const arr = Array.isArray(d) ? d : (d?.staff || []);
        setCouriers(arr.filter((s: any) => s.is_active && s.roles?.name === 'courier').map((s: any) => ({ id: s.id, name: s.name })));
      })
      .catch(() => {});
  }, []);

  const assignCourier = async (o: BdOrder, c: { id: string; name: string }) => {
    try {
      const res = await apiFetch('/api/orders/courier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: o.id, courier_id: c.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'Courier assignment failed');
      toast.success(`${t('bds_courier') || 'Kuryer'}: ${c.name} — #${o.order_number || o.id.slice(-4).toUpperCase()}`);
      setCourierPickerFor(null);
      fetchBds();
    } catch (e: any) {
      toast.error(e?.message || t('error_occurred'));
    }
  };

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
      setDeliveryAccepting(data.delivery?.accepting !== false);
    } catch { /* poll: ignore transient */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBds();
    tickRef.current = setInterval(fetchBds, POLL_MS);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [fetchBds]);

  // 2026-09-26 (Task 53 P0-2 realtime): BDS board was the last poll-only
  // ops surface (5s). Row changes on orders/order_items now push a debounced
  // refetch (1.5s coalescing) — courier status flips + new delivery orders
  // appear on the board sub-second across terminals. POLL_MS stays as
  // safety fallback (defense-in-depth, same pattern as pos-sync).
  useCrossTableRefresh('bds-board', ['orders', 'order_items'], fetchBds, 1500);

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
    // 2026-09-23 (owner): dine-in orders appear on the board too — "nie
    // dine-in sifarisleri eks olunmur". A dine-in order stays active until
    // it is PAID (served/dining are mid-flow states, not terminal).
    dine_in: (o) =>
      (o.order_source === 'dine_in' || (!o.order_source && o.table_number != null))
      && !ORDER_DEAD.includes(o.status)
      && o.status !== 'paid'
      && (o.kitchen_status || 'pending') !== 'cancelled',
  };
  // 2026-09-23 (owner): the board DEFAULTS to the ALL tab — "tablar olmasina
  // birbasaa sifarisler ekranda eks olunsun". Station tabs filter from there.
  const ALL_TAB = { id: '__all', label: t('bds_tab_all') || 'Bütün', station_type: '__all', icon: LayoutGrid };
  const stationTabs: { id: string; label: string; station_type: string; icon: any }[] =
    bdsStations.length > 0
      ? bdsStations.map(s => ({ id: s.id, label: s.name, station_type: s.station_type, icon: s.station_type === 'delivery' ? Bike : ShoppingBag }))
      : [
          { id: '__delivery', label: t('bds_tab_delivery'), station_type: 'delivery', icon: Bike },
          { id: '__takeaway', label: t('bds_tab_takeaway'), station_type: 'pickup', icon: ShoppingBag },
        ];
  const tabList = [ALL_TAB, ...stationTabs];
  const activeTab = tabList.find(x => x.id === selectedTabId) || ALL_TAB;
  const isAllTab = activeTab.id === '__all';
  const isDeliveryTab = activeTab.station_type === 'delivery';
  const board = (isAllTab
    ? orders.filter(o => isActiveByType.delivery(o) || isActiveByType.pickup(o) || isActiveByType.dine_in(o))
    : orders.filter(o =>
        (isActiveByType[activeTab.station_type] || (() => false))(o)
        // '__' fallback tabs predate station ids: match by family only.
        && (activeTab.id.startsWith('__') || o.bds_station_id == null || o.bds_station_id === activeTab.id)))
    // 12e (B1): 24h service window (see BDS_STALE_MS)
    .filter(o => Date.now() - new Date(o.created_at).getTime() < BDS_STALE_MS);
  // 12e (B2): NEWEST-FIRST. The old ascending sort buried a 2-minute-old order
  // under 25 day-old cards — the dispatcher scrolled to the very bottom to
  // find fresh work (E2E: #D085 at the bottom of the board). KDS intentionally
  // keeps oldest-first (most-delayed on top) — correct for the kitchen.
  board.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
        <div className="flex items-center gap-3">
          {/* Delivery Phase 2: live accepting pause (mirrors Settings → Çatdırılma) */}
          <button
            onClick={toggleDeliveryAccepting}
            disabled={togglingDelivery}
            title={deliveryAccepting ? (t('bds_pause_confirm') || 'Çatdırılma sifarişlərinin qəbulunu dayandırsın?') : (t('bds_resume_delivery') || 'Qəbulu davam etdir')}
            className={`h-9 px-3.5 rounded-xl flex items-center gap-2 text-[11px] font-black tracking-wide border transition-all active:scale-[0.97] disabled:opacity-50 ${
              deliveryAccepting
                ? (lightMode ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300')
                : (lightMode ? 'bg-red-50 border-red-300 text-red-600' : 'bg-red-500/10 border-red-500/30 text-red-300')
            }`}
          >
            {deliveryAccepting ? <CheckCircle2 size={13} /> : <PauseCircle size={13} />}
            {deliveryAccepting ? (t('bds_delivery_active') || 'Çatdırılma aktiv') : (t('bds_delivery_paused') || 'Qəbul dayandırılıb')}
          </button>
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
                // 2026-09-23 (owner): per-order kind — the ALL tab mixes
                // dine-in + delivery + pickup on one board; station tabs are
                // single-kind (the tab's family wins there).
                const kind: 'delivery' | 'pickup' | 'dine_in' =
                  o.order_source === 'delivery' ? 'delivery' : o.order_source === 'takeaway' ? 'pickup' : 'dine_in';
                const isDeliveryKind = isAllTab ? kind === 'delivery' : isDeliveryTab;
                const taken = kind === 'pickup' && o.status === 'served';
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
                      {/* Title row — per-order kind: "Masa N" / "Çatdırılma XXXX" / "Gel-Al XXXX" */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {kind === 'delivery'
                            ? <Bike size={15} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />
                            : kind === 'dine_in'
                              ? <Utensils size={15} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />
                              : <ShoppingBag size={15} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />}
                          <span className={`text-sm font-black tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                            {kind === 'delivery' ? t('delivery_short') : kind === 'dine_in' ? `${t('table_label')} ${o.table_number ?? '?'}` : t('takeaway_short')}
                          </span>
                          {kind !== 'dine_in' && (
                            <span className={`text-sm font-black tabular-nums ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{orderNo}</span>
                          )}
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
                    {isDeliveryKind && (o.delivery_address || o.delivery_zone) && (
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="flex items-center gap-1 text-[11px] min-w-0 truncate">
                          <MapPin size={11} className={lightMode ? 'text-zinc-300' : 'text-white/25'} />
                          <span className={`font-semibold truncate ${lightMode ? 'text-zinc-600' : 'text-white/55'}`}>{o.delivery_address || '—'}</span>
                        </span>
                        {o.delivery_zone && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${lightMode ? 'bg-purple-50 text-purple-500 border-purple-200' : 'bg-purple-500/10 text-purple-300 border-purple-400/20'}`}>{o.delivery_zone}</span>}
                        {Number(o.delivery_fee) > 0 && <span className={`flex items-center gap-1 text-[10px] font-black ${lightMode ? 'text-amber-500' : 'text-amber-300'}`}><Wallet size={10} />₼{Number(o.delivery_fee).toFixed(0)}</span>}
                        {/* Delivery Phase 2: promised ETA (server-resolved from
                            the zone's ETA range at send) — red once overdue. */}
                        {o.estimated_delivery_time && (() => {
                          const eta = new Date(o.estimated_delivery_time);
                          const overdue = !Number.isNaN(eta.getTime()) && eta.getTime() < Date.now();
                          return (
                            <span className={`flex items-center gap-1 text-[10px] font-black ${overdue ? (lightMode ? 'text-red-500' : 'text-red-400') : (lightMode ? 'text-zinc-400' : 'text-white/40')}`}>
                              <Clock size={10} />
                              ETA {eta.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          );
                        })()}
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

                    {/* Courier assignment (delivery only) — real staff record */}
                    {kind === 'delivery' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setCourierPickerFor(courierPickerFor === o.id ? null : o.id)}
                          className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-black border transition-all active:scale-[0.97] ${
                            o.courier_name
                              ? (lightMode ? 'bg-sky-50 border-sky-300 text-sky-600' : 'bg-sky-500/10 border-sky-400/30 text-sky-300')
                              : (lightMode ? 'bg-white border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400' : 'bg-white/[0.02] border-dashed border-white/15 text-white/40 hover:border-white/30')
                          }`}
                        >
                          <Bike size={12} />
                          {o.courier_name || (t('bds_pick_courier') || 'Kuryer seç')}
                        </button>
                        {courierPickerFor === o.id && (
                          <div className="flex flex-wrap gap-1.5">
                            {couriers.length === 0 && (
                              <span className={`text-[10px] font-bold px-2 py-1 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                {t('bds_courier_empty') || 'Staff-də aktiv kuryer yoxdur'}
                              </span>
                            )}
                            {couriers.map(c => (
                              <button
                                key={c.id}
                                onClick={() => assignCourier(o, c)}
                                className={`h-7 px-2.5 rounded-full text-[11px] font-black border transition-all active:scale-95 ${
                                  c.name === o.courier_name
                                    ? 'bg-emerald-500 text-white border-emerald-400'
                                    : (lightMode ? 'bg-white border-zinc-300 text-zinc-600 hover:border-emerald-400' : 'bg-white/5 border-white/10 text-white/60 hover:border-emerald-400/50')
                                }`}
                              >
                                {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* BDS-owned actions (courier side / handover) */}
                    <div className="flex items-center gap-2 mt-auto flex-wrap">
                      {kind === 'dine_in' ? (
                        // Dine-in: nothing for the courier side — kitchen
                        // progress is owned by the KDS (read-only hint).
                        <span className={`flex items-center gap-1.5 text-[10px] font-bold ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                          <ChefHat size={11} />
                          {t('bds_dinein_kds') || 'Mətbəx statusu KDS-də idarə olunur'}
                        </span>
                      ) : isDeliveryKind ? (
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
