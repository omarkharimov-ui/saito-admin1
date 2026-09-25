'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, ChefHat, CheckCircle2, AlertTriangle, Volume2, VolumeX,
  Package, Truck, Utensils, Flame, Timer, Bell, Printer, Coffee
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { apiFetch } from '@/lib/api-fetch';
import { PartnerBadge, PartnerStripe } from './PartnerBadge';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings-client';
import { usePrintClaimLoop, type PrintJob } from '@/hooks/usePrintClaimLoop';
import { printKitchenTicket, printReceipt, getReceiptSettings } from '@/lib/print/PrintService';

interface KDSItem {
  id: string;
  name: string;
  quantity: number;
  prepared_quantity: number;
  kitchen_status: string;
  modifiers?: { id: string; name: string; price: number; quantity: number }[];
  special_notes?: string;
  /** AUDIT 2026-09-21: course + hold were invisible in the kitchen — the
   *  kitchen could start cooking held items and never saw appetizer/main
   *  timing. Both are persisted on order_items; the KDS just didn't map them. */
  course?: string | null;
  is_hold?: boolean;
  /** BDS #28: station snapshot (order_items.station_id, set by the
   *  BEFORE INSERT trigger from products.station_id). Legacy locked lines
   *  and manual (product-less) lines are NULL → displayed at the Main
   *  Kitchen default board. */
  station_id?: string | null;
}

interface KDSStation { id: string; name: string; station_type?: string; }

interface KDSOrder {
  id: string;
  table_number: number;
  order_source: string;
  order_type?: string;
  partner_source?: string | null;
  customer_name?: string;
  customer_phone?: string;
  customer_note?: string;
  items: KDSItem[];
  created_at: string;
  kitchen_status: string;
}

function getItemTimerStatus(createdAt: string, criticalMin: number, delayMin: number): { color: 'green' | 'yellow' | 'red' | 'purple'; text: string; elapsed: number } {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (elapsed < criticalMin) return { color: 'green', text: formatElapsedMin(elapsed), elapsed };
  if (elapsed < delayMin) return { color: 'red', text: 'KRİTİK', elapsed };
  return { color: 'purple', text: 'GEÇİKME', elapsed };
}

// 2026-09-22 (E2E finding): the timer rendered MINUTES with a 'd' (day)
// suffix and no cap — 9 days of age showed as "13040d" (looked like 36 years).
// Now: proper m / h m / d h units, same convention as the pickup list.
function formatElapsedMin(elapsed: number): string {
  if (!isFinite(elapsed) || elapsed < 0) return '0m';
  if (elapsed < 60) return `${Math.floor(elapsed)}m`;
  if (elapsed < 1440) return `${Math.floor(elapsed / 60)}h ${Math.floor(elapsed % 60)}m`;
  return `${Math.floor(elapsed / 1440)}d ${Math.floor((elapsed % 1440) / 60)}h`;
}

function getTimerStyles(color: 'green' | 'yellow' | 'red' | 'purple', lightMode: boolean) {
  switch (color) {
    case 'green':
      return lightMode
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'yellow':
      return lightMode
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'red':
      return lightMode
        ? 'bg-red-100 text-red-700 border-red-200'
        : 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'purple':
      return lightMode
        ? 'bg-purple-100 text-purple-700 border-purple-200'
        : 'bg-purple-500/10 text-purple-300 border-purple-500/20';
  }
}

function getOrderBadge(order: KDSOrder, lightMode: boolean) {
  if (order.order_source === 'takeaway') {
    return (
      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold tracking-wider ${lightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/10 text-amber-300'}`}>
        <Package size={10} /> GEL-AL
      </span>
    );
  }
  if (order.order_source === 'delivery') {
    return (
      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold tracking-wider ${lightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/10 text-blue-300'}`}>
        <Truck size={10} /> ÇATDIR
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold tracking-wider ${lightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/10 text-emerald-300'}`}>
      <Utensils size={10} /> İCƏRİDƏ
    </span>
  );
}

/**
 * stationType (2026-09-24, owner): restrict this terminal to ONE station
 * family — the /admin/bds Bar Display passes 'bar': only tickets with items
 * routed to bar stations are shown (KDS stays the full kitchen terminal).
 * Items without a station snapshot never fall back to Main Kitchen here —
 * they belong to the kitchen boards, not the bar screen.
 */
export function KDSView({ onBack, stationType }: { onBack: () => void; stationType?: string }) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [delayMin, setDelayMin] = useState(30);
  const prevOrderCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // BDS #28 — station boards. SSOT: `stations` (via /api/stations; the
  // stations RLS policy is location-scoped so the browser client can't be
  // relied on). stationFilter = null → "BƏNÝƏ" board (all stations).
  const [stations, setStations] = useState<KDSStation[]>([]);
  const [stationFilter, setStationFilter] = useState<string | null>(null);
  useEffect(() => {
    // kind=kitchen: kitchen-family stations only — delivery/pickup (BDS)
    // stations are a separate family and must never appear as kitchen boards.
    fetch('/api/stations?kind=kitchen', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: any) => setStations(Array.isArray(d) ? d : []))
      .catch(() => setStations([]));
  }, []);
  // 2026-09-24 (BDS bar display): when restricted to a station family, the
  // board shows only that family's stations; the kitchen fallback is
  // disabled so snapshot-less (kitchen) items never leak onto the bar screen.
  const boardStations = stationType ? stations.filter(s => s.station_type === stationType) : stations;
  const boardStationIds = new Set(boardStations.map(s => s.id));
  // Items with no station snapshot (legacy locked lines / manual lines)
  // display at the Main Kitchen default board (matches the backfill rule).
  const fallbackStationId = !stationType
    ? (stations.find(s => s.name === 'Main Kitchen')?.id || stations[0]?.id || null)
    : null;
  const itemStation = (i: KDSItem) => i.station_id || (stationType ? null : fallbackStationId);
  const itemInBoard = (i: KDSItem) => {
    const st = itemStation(i);
    return st ? boardStationIds.has(st) : !stationType;
  };
  const isItemReady = (i: KDSItem) => i.kitchen_status === 'ready' || i.kitchen_status === 'completed';
  const stationPendingCount = (stId: string) =>
    orders.reduce((sum, o) => sum + o.items.filter(i => itemStation(i) === stId && !isItemReady(i)).length, 0);

  // pr v1 — this KDS terminal is a browser print terminal too: claims
  // kitchen (and receipt) jobs routed to browser devices of the location.
  usePrintClaimLoop(true, {
    onPrint: async (job: PrintJob) => {
      const settings = await getReceiptSettings().catch(() => null);
      const p = job.payload || {};
      const paper = job.device?.paper_width || settings?.paperWidth || '80mm';
      const copies = job.device?.copies || 1;
      if (job.doc_type === 'kitchen') {
        return printKitchenTicket({
          restaurantName: settings?.restaurantName || 'Restoran',
          table: p.table,
          orderNumber: p.orderNumber,
          items: p.items || [],
          note: p.note || null,
          staffName: p.staffName || '',
          date: p.date || '',
          time: p.time || '',
          paperWidth: paper,
          copies,
        });
      }
      if (job.doc_type === 'receipt') {
        return printReceipt({
          restaurantName: p.restaurantName || settings?.restaurantName || 'Restoran',
          address: p.address || settings?.address || '',
          receiptTitle: p.receiptTitle || settings?.receiptTitle || 'SİFARİŞ ÇEKİ',
          currency: p.currency || settings?.receiptCurrency || '₼',
          serviceFeePct: p.serviceFeePct ?? settings?.serviceFeePct ?? 10,
          showServiceFee: p.showServiceFee ?? settings?.showServiceFee ?? true,
          footerText: p.footerText || settings?.footerText || '',
          tableNumber: p.tableNumber,
          orderId: p.orderId,
          items: p.items || [],
          subtotal: p.subtotal || 0,
          discount: p.discount || 0,
          discountName: p.discountName,
          tip: p.tip || 0,
          total: p.total || 0,
          paymentMethod: p.paymentMethod || '',
          cashAmount: p.cashAmount || 0,
          cardAmount: p.cardAmount || 0,
          date: p.date || new Date().toISOString(),
          time: p.time || new Date().toISOString(),
          paperWidth: paper,
          copies,
        });
      }
      return false;
    },
  });

  const reprintTicket = async (order: KDSOrder) => {
    const items = (order.items || [])
      .filter((i) => i.kitchen_status !== 'completed' && i.kitchen_status !== 'cancelled')
      .map((i) => ({
        name: i.name,
        quantity: Math.max(0, i.quantity - (i.prepared_quantity || 0)),
        note: i.special_notes || null,
        // AUDIT 2026-09-21: course was hardcoded null on the printed kitchen
        // ticket; held items and modifier quantities were omitted entirely.
        course: i.course || null,
        is_hold: Boolean(i.is_hold),
        modifiers: (i.modifiers ?? []).map((m) => ({ name: m.name, quantity: m.quantity || 1 })),
      }));
    if (items.length === 0) { toast.error('Aktiv məhsul yoxdur'); return; }
    try {
      const res = await apiFetch('/api/print/enqueue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: 'kitchen',
          order_id: order.id,
          trigger_key: `kitchen-reprint:${Date.now()}`,
          payload: {
            table: order.table_number,
            orderNumber: null,
            items,
            note: null,
            staffName: null,
            date: new Date().toLocaleDateString('az-AZ'),
            time: new Date().toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.error || 'Xəta'); return; }
      toast.success(d.routed === false ? 'Göndərildi (device yoxdur — terminal çap edəcək)' : 'Bilet yenidən çapa göndərildi');
    } catch { toast.error('Şəbəkə xətası'); }
  };

  useEffect(() => {
    getSettings('order').then((row) => {
      const val = Number(row.order_delay_minutes);
      if (!isNaN(val) && val >= 1) setDelayMin(val);
    });
  }, []);

  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 880;
      const gain1 = ctx.createGain();
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 1100;
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.4);
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    const fetchKDS = async () => {
      try {
        const res = await apiFetch('/api/orders');
        if (!res.ok) return;
        const data = await res.json();
        const kdsOrders: KDSOrder[] = (data.orders || [])
          // A KDS ticket is only valid while the order can still progress in
          // the kitchen. Terminal/fulfilled statuses (closed, refunded, ...)
          // must NOT show — a closed order on the KDS makes the ✓ no-op
          // (mark-ready rejects it) and the ticket is "stuck" forever.
           .filter((o: any) => !['paid','cancelled','closed','refunded','partially_refunded','voided'].includes(o.status)
             && o.kitchen_status !== null && o.kitchen_status !== 'completed' && o.kitchen_status !== 'cancelled'
             // 2026-09-22 (zombie root-cause): an order is a KDS ticket ONLY
             // while it has ≥1 active (non-terminal, qty>0) kitchen item.
             // Item-less probe orders used to leak in as empty "Masa ?" tickets.
             && (o.order_items || []).some((i: any) =>
               (i.quantity ?? 0) > 0 && !['completed','cancelled','voided'].includes(i.kitchen_status || 'pending')))
          .map((o: any) => ({
            id: o.id,
            table_number: o.table_number,
             order_source: o.order_source || 'dine_in',
             order_type: o.order_type,
             partner_source: o.partner_source,
             customer_name: o.customer_name,
            customer_phone: o.customer_phone,
            customer_note: o.customer_note,
            items: (o.order_items || []).map((i: any) => ({
              id: i.id,
              name: i.product_name || i.product_id,
              quantity: i.quantity,
              prepared_quantity: i.prepared_quantity || 0,
              kitchen_status: i.kitchen_status || 'pending',
              modifiers: i.modifiers,
              special_notes: i.special_notes,
              course: i.course ?? null,
              is_hold: Boolean(i.is_hold),
              station_id: i.station_id ?? null,
            })),
            created_at: o.created_at,
            kitchen_status: o.kitchen_status || 'pending',
          }));

        // 2026-09-24 (bar display): the new-order sound counts only tickets
        // this terminal actually shows (station-family filtered).
        const shownOrders = stationType
          ? kdsOrders.filter(o => o.items.some(i => i.station_id && boardStationIds.has(i.station_id)))
          : kdsOrders;
        if (shownOrders.length > prevOrderCountRef.current && prevOrderCountRef.current > 0) {
          playSound();
          toast(`${shownOrders.length - prevOrderCountRef.current} ${t('new_order')}!`, { id: 'kds-toast' });
        }
        prevOrderCountRef.current = shownOrders.length;
        setOrders(kdsOrders);
      } catch {
        toast.error(t('orders_load_error'), { id: 'kds-toast' });
      } finally {
        setLoading(false);
      }
    };
    fetchKDS();
    const interval = setInterval(fetchKDS, 5000);
    return () => clearInterval(interval);
  }, [playSound]);

  // U-1 fix: per-item ✓ now calls the FROZEN atomic mark-ready route for a
  // single item (the old action 'updateItemStatus' was not handled by
  // /api/orders, so clicks silently no-op'd). Optimistic update is rolled
  // back on failure so a 400 (already-ready / wrong state) stays consistent.
  const handleItemStatus = async (orderId: string, itemId: string, status: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      items: o.items.map(i => i.id === itemId ? { ...i, kitchen_status: status } : i),
    } : o));
    try {
      const res = await apiFetch('/api/orders/mark-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, item_ids: [itemId] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setOrders(prev => prev.map(o => o.id === orderId ? {
          ...o,
          items: o.items.map(i => i.id === itemId ? { ...i, kitchen_status: 'preparing' } : i),
        } : o));
        toast.error(d?.error || t('status_update_error'), { id: 'kds-toast' });
      }
    } catch {
      toast.error(t('status_update_error'), { id: 'kds-toast' });
    }
  };

  const handleMarkReady = async (orderId: string) => {
    // 2026-09-22 (BDS E2E finding): the old body never checked res.ok — a
    // 500 from mark-ready would still drop the ticket + show success.
    try {
      const res = await apiFetch('/api/orders/mark-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error || t('status_update_error'), { id: 'kds-toast' });
        return;
      }
      setOrders(prev => prev.filter(o => o.id !== orderId));
      toast.success(`${t('order_ready')}!`, { id: 'kds-toast' });
    } catch {
      toast.error(t('status_update_error'), { id: 'kds-toast' });
    }
  };

  // BDS #28 — the active board: on a station tab only tickets with ≥1 item
  // routed to that station are shown; each ticket lists ONLY its items for
  // that station. The complete-order button stays on the whole-order
  // invariant (all stations done) so a station can never pull the order
  // into TƏHVİLƏ HAZIR while another station is still cooking.
  const boardOrders = orders.filter(o =>
    o.items.some(i => itemInBoard(i) && (!stationFilter || itemStation(i) === stationFilter))
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between flex-shrink-0 pb-4 border-b ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${lightMode ? 'bg-white border-gray-200 text-gray-500' : 'bg-white/[0.04] border-white/[0.08] text-white/45'}`}>
            {stationType ? <Coffee size={18} /> : <ChefHat size={18} />}
          </div>
          <div>
            <p className={`text-lg font-bold tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>{stationType ? t('bds_bar_screen') : t('kds_screen')}</p>
            <p className={`text-xs ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>{boardOrders.length} {t('active_orders_short')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${lightMode ? 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50' : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:bg-white/[0.08]'}`}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={onBack} className={`h-9 px-3.5 rounded-2xl text-xs font-semibold transition-all border ${lightMode ? 'text-gray-500 hover:text-gray-700 bg-white border-gray-200' : 'text-white/35 hover:text-white/65 bg-white/[0.04] border-white/[0.08]'}`}>
            {t('back')}
          </button>
        </div>
      </div>

      {/* BDS #28 — station board tabs (SSOT: stations). One board per
          station; a ticket appears on a station board while it has ≥1 item
          routed there. Items without a snapshot land at Main Kitchen.
          2026-09-24: the bar display (stationType='bar') hides the tab row
          when there is a single bar station — the whole screen is that board. */}
      {boardStations.length > 0 && (!stationType || boardStations.length > 1) && (
        <div className="flex items-center gap-2 flex-shrink-0 px-0.5 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            type="button"
            onClick={() => setStationFilter(null)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border transition-all ${stationFilter === null ? (lightMode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-black border-white') : (lightMode ? 'bg-white text-gray-500 border-gray-200 hover:border-gray-300' : 'bg-white/[0.04] text-white/45 border-white/[0.08] hover:text-white/70')}`}
          >
            {t('kds_all_stations')} · {orders.length}
          </button>
            {boardStations.map(st => {
              const pending = stationPendingCount(st.id);
              const active = stationFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStationFilter(active ? null : st.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border transition-all ${active ? (lightMode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-black border-white') : (lightMode ? 'bg-white text-gray-500 border-gray-200 hover:border-gray-300' : 'bg-white/[0.04] text-white/45 border-white/[0.08] hover:text-white/70')}`}
              >
                <ChefHat size={11} className={active ? '' : 'opacity-50'} />
                {st.name}
                {pending > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${active ? 'bg-white/20' : (lightMode ? 'bg-red-100 text-red-600' : 'bg-red-500/20 text-red-300')}`}>
                    {pending}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Orders Grid */}
      <div className="flex-1 overflow-y-auto py-3">
        {boardOrders.length === 0 ? (
          /* 2026-09-23 sweep fix: dark-mode empty state was unreadable
             (white/15 + 30% icon). Bumped to white/45 + 60% icon. */
          <div className={`flex flex-col items-center justify-center h-full ${lightMode ? 'text-gray-400' : 'text-white/45'}`}>
            <CheckCircle2 size={40} className="mb-3 opacity-60" />
            <p className="text-sm">{stationFilter ? t('kds_station_empty') : t('all_orders_ready')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {boardOrders.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(order => {
                const criticalMin = Math.max(1, Math.round(delayMin / 2));
                const timer = getItemTimerStatus(order.created_at, criticalMin, delayMin);
                const allItemsReady = order.items.every(isItemReady);
                // BDS #28: on a station board the ticket lists only that
                // station's items; progress + the "other stations" hint are
                // computed on the visible subset. 2026-09-24: itemInBoard
                // additionally scopes everything to the terminal's station
                // family (bar display).
                const visibleItems = order.items.filter(i =>
                  itemInBoard(i) && (!stationFilter || itemStation(i) === stationFilter)
                );
                const visibleReady = visibleItems.filter(isItemReady).length;
                const visibleAllReady = visibleItems.length > 0 && visibleReady === visibleItems.length;
                const otherPending = stationFilter
                  ? order.items.filter(i => itemInBoard(i) && itemStation(i) !== stationFilter && !isItemReady(i)).length
                  : 0;
                return (
                   <div
                     key={order.id}
                     className={`relative overflow-hidden rounded-3xl border p-4 transition-all duration-200 ${
                       allItemsReady
                         ? (lightMode ? 'border-emerald-300 bg-emerald-50' : 'border-emerald-500/30 bg-emerald-500/5')
                         : timer.color === 'red' || timer.color === 'purple'
                           ? (lightMode ? 'border-red-300 bg-red-50 shadow-sm' : 'border-red-500/30 bg-red-500/5 shadow-sm')
                           : (lightMode ? 'border-gray-200 bg-white shadow-sm' : 'border-white/[0.08] bg-white/[0.02]')
                     }`}
                   >
                     {/* 2026-09-25 (owner): partner branding on the ticket —
                         brand-color left stripe + logo chip next to the title,
                         so kitchens see at a glance a Bolt/Uber/Glovo/Wolt job. */}
                     <PartnerStripe source={order.partner_source} />
                     {/* Order Header */}
                     <div className="flex items-center justify-between mb-3">
                       <div className="flex items-center gap-2">
                         <span className={`text-xl font-black tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                           {order.order_source === 'dine_in' ? `Masa ${order.table_number ?? '?'}` : order.customer_name || (order.order_source === 'takeaway' ? t('takeaway_short') : t('delivery_short'))}
                         </span>
                         {getOrderBadge(order, lightMode)}
                         <PartnerBadge source={order.partner_source} />
                        {stationFilter && visibleItems.length > 1 && (
                          <span className={`text-[11px] font-black px-2 py-1 rounded-full border ${visibleAllReady ? (lightMode ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20') : (lightMode ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-white/[0.05] text-white/55 border-white/[0.08]')}`}>
                            {visibleReady}/{visibleItems.length}
                          </span>
                        )}
                        {(timer.color === 'red' || timer.color === 'purple') && (
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold tracking-wider border ${getTimerStyles(timer.color, lightMode)}`}>
                            <AlertTriangle size={10} />
                            {timer.text}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold tracking-[0.18em] border ${getTimerStyles(timer.color, lightMode)}`}>
                          <Timer size={10} />
                          {formatElapsedMin(timer.elapsed)}
                        </span>
                        {(timer.color === 'red' || timer.color === 'purple') && <AlertTriangle size={14} className="animate-pulse text-red-500" />}
                        <button
                          type="button"
                          onClick={() => reprintTicket(order)}
                          title="Bileti yenidən çap et"
                          className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${lightMode ? 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50' : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:bg-white/[0.08] hover:text-white/70'}`}
                        >
                          <Printer size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Customer info for takeaway/delivery */}
                    {order.order_source !== 'dine_in' && order.customer_phone && (
                      <p className={`text-xs mb-2 ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>
                        {order.customer_phone}
                      </p>
                    )}

                    {/* Items (BDS #28: filtered to the active station board) */}
                    <div className="space-y-1.5 mb-3">
                      {visibleItems.map(item => {
                        const itemReady = item.kitchen_status === 'ready' || item.kitchen_status === 'completed';
                        // Modifier names with quantities — "add 2 cheese" must
                        // reach the kitchen as "Cheese ×2", not "Cheese".
                        const modText = (item.modifiers ?? [])
                          .map(m => (m.quantity && m.quantity > 1 ? `${m.name} ×${m.quantity}` : m.name))
                          .join(', ');
                        return (
                          <div key={item.id} className={`flex items-center justify-between gap-2 rounded-2xl px-2 py-1.5 transition-all ${item.is_hold ? (lightMode ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-amber-500/10 ring-1 ring-amber-500/30') : itemReady ? (lightMode ? 'bg-emerald-50' : 'bg-emerald-500/5') : ''}`}>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {item.is_hold && (
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${lightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`}>
                                  HOLD
                                </span>
                              )}
                              <span className={`text-sm font-medium truncate ${item.is_hold ? (lightMode ? 'text-amber-800' : 'text-amber-200/80') : itemReady ? (lightMode ? 'text-emerald-600 line-through' : 'text-emerald-400 line-through') : (lightMode ? 'text-gray-800' : 'text-white/85')}`}>
                                {item.name}
                              </span>
                              {item.course && (
                                <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${lightMode ? 'bg-sky-100 text-sky-700' : 'bg-sky-500/15 text-sky-400'}`}>
                                  {item.course}
                                </span>
                              )}
                              {modText ? (
                                <span className={`text-xs shrink-0 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
                                  {modText}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-xs font-bold ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>×{item.quantity}</span>
                              {!itemReady ? (
                                <button
                                  onClick={() => handleItemStatus(order.id, item.id, 'ready')}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-all active:scale-95 ${lightMode ? 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-500' : 'bg-white/5 border-white/10 text-white/40 hover:border-emerald-500/30 hover:text-emerald-400'}`}
                                >
                                  ✓
                                </button>
                              ) : (
                                <CheckCircle2 size={14} className="text-emerald-500" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Customer note */}
                    {order.customer_note && (
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl mb-2 ${lightMode ? 'bg-amber-50 border border-amber-200' : 'bg-amber-500/5 border border-amber-500/10'}`}>
                        <Bell size={10} className={lightMode ? 'text-amber-600' : 'text-amber-400'} />
                        <span className={`text-xs font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>{order.customer_note}</span>
                      </div>
                    )}

                    {/* Action — whole-order invariant: the complete button
                        appears only when EVERY station's items are ready.
                        On a station board with this station done but others
                        still cooking, show the pending count instead. */}
                    {allItemsReady ? (
                      <button
                        onClick={() => handleMarkReady(order.id)}
                        className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all ${lightMode ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}
                      >
                        {t('complete_order')}
                      </button>
                    ) : stationFilter && visibleAllReady && otherPending > 0 ? (
                      <div className={`w-full py-2.5 rounded-2xl text-xs font-bold text-center border cursor-not-allowed ${lightMode ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/5 text-amber-300 border-amber-500/15'}`}>
                        {t('kds_other_stations_pending')} · {otherPending}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
