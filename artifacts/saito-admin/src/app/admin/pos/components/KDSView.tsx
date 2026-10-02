'use client';

import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Clock, ChefHat, CheckCircle2, AlertTriangle, Volume2, VolumeX,
  Package, Truck, Utensils, Flame, Timer, Bell, Printer, Coffee, Phone, X
} from '@/components/ui/saito-icons';
import { appleBackdrop } from '@/lib/modal-transitions';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { apiFetch } from '@/lib/api-fetch';
import { PartnerLogo, PartnerStripe } from './PartnerBadge';
import { parseAllergens, resolveAllergenEntry } from '@/lib/allergens';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings-client';
import { usePrintClaimLoop, type PrintJob } from '@/hooks/usePrintClaimLoop';
import { printKitchenTicket, printReceipt, getReceiptSettings } from '@/lib/print/PrintService';
import { useCrossTableRefresh } from '@/hooks/useCrossTableRefresh';

/** 2026-10-02 (12e, owner KDS review K1): the board had NO time window — a
 *  never-closed order sat as a ticket for WEEKS (E2E: "3d 16h" cards on the
 *  same grid as a 1-minute one). A kitchen works the current service:
 *  tickets >24h old drop off the board (DB row untouched — nothing deleted). */
const KDS_STALE_MS = 24 * 60 * 60 * 1000;

// 2026-10-02 (12f, Apple philosophy — SAITO_MOTION_PHILOSOPHY rules 3/11):
// card entry/exit + ✓ feedback = small structural motion (fast spring, no
// bounce); in-place expand = one visible settling step (softer spring).
const CARD_SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;
// 2026-10-02 (12g, owner: "POS-da olan tick transition var — eynisindən
// istifadə edək"): the EXACT shared-element morph of the POS product grid
// (ProductGrid.tsx — layoutId card ⇄ centered modal, spring 300/30/0.8).
const MORPH_SPRING = { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 } as const;

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
  /** 2026-09-28 (per-instance state machine): customer-allergy flags
   *  (order_items.allergens) — the kitchen must SEE them on the ticket;
   *  before this the KDS never mapped the column at all. */
  allergens?: string[];
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
  /** 12f: promised ETA (server-resolved at send) — shown in the in-place
   *  detail block; red once overdue. */
  estimated_delivery_time?: string | null;
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
        ? 'bg-zinc-900 text-white border-zinc-900' // 2026-09-28 (owner: light — yalnız mavi/qara)
        : 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'red':
      return lightMode
        ? 'bg-red-100 text-red-700 border-red-200'
        : 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'purple':
      // 12g (owner: "Gecikmə qırmızı rəngdə göstərilsin"): GEÇİKME is now
      // SOLID red — deliberately stronger than KRİTİK's red tint (worse).
      return lightMode
        ? 'bg-red-600 text-white border-red-600'
        : 'bg-red-500/90 text-white border-red-500';
  }
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
  const fetchKDSRef = useRef<() => void>(() => {});

  // BDS #28 — station boards. SSOT: `stations` (via /api/stations; the
  // stations RLS policy is location-scoped so the browser client can't be
  // relied on). stationFilter = null → "BƏNÝƏ" board (all stations).
  const [stations, setStations] = useState<KDSStation[]>([]);
  // 2026-10-02 (12f, owner): "kart in place expand olmalıdır ki detalli baxa
  // bilsin chef" — ONE ticket expanded at a time, grows in place (no modal).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Motion philosophy rule 12: respect prefers-reduced-motion.
  const reduceMotion = useReducedMotion();
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
      // 2026-10-02 (12f, owner: "yeni notification üçün səs amma ÇOX premium,
      // İNCE — Outlook-da var, çox qəşəydir"): the old 880/1100 Hz beep was a
      // harsh "computer chirp" in a busy kitchen. Outlook's real asset lives
      // behind the OWA login wall (browser hunt = NOT_FOUND, keyless stack),
      // so this is a synthesized SOFT BELL in the same spirit: E6 fundamental
      // + 2× shimmer partial + low E5 body, 5 ms attack, ~1.2 s exponential
      // decay, low peak gain — audible across the room, never startling.
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const ring = (freq: number, peak: number, decay: number, at = 0) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now + at);
        g.gain.exponentialRampToValueAtTime(peak, now + at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + at + decay);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + at);
        osc.stop(now + at + decay + 0.05);
      };
      ring(1318.5, 0.10, 1.2);   // E6 — the "ding" body
      ring(2637.0, 0.02, 0.45);   // 2× shimmer (bell inharmonic, very quiet)
      ring(659.3, 0.045, 0.65);   // E5 low warmth
    } catch {}
  }, [soundEnabled]);

  // 2026-10-02 (12f): browsers keep AudioContext SUSPENDED until a user
  // gesture — a new ticket arriving while the page is idle would be a
  // silent no-op. The chef has always touched the terminal before the next
  // ticket, but unlock on the first interaction so the premium chime can
  // never be swallowed.
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
      } catch {}
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

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
              // 12e (K1): 24h service window — stale tickets hide (grid + count both clean)
              && (Date.now() - new Date(o.created_at).getTime()) < KDS_STALE_MS
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
             estimated_delivery_time: o.estimated_delivery_time ?? null,
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
              allergens: i.allergens
                ? (typeof i.allergens === 'string' ? (() => { try { return JSON.parse(i.allergens); } catch { return []; } })() : i.allergens)
                : [],
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
    fetchKDSRef.current = fetchKDS;
    const interval = setInterval(fetchKDS, 5000);
    return () => clearInterval(interval);
  }, [playSound]);

  // 2026-09-26 (Task 53 P0-2 realtime): KDS/BDS was the last major board on
  // poll-only sync (5s). Now orders/order_items row changes push a debounced
  // refetch (~1.5s coalescing) — sub-second ticket appearance across
  // terminals, Toast-style. The 5s poll stays as the safety fallback (same
  // defense-in-depth pattern as pos-sync).
  useCrossTableRefresh('kdsview', ['orders', 'order_items'], () => fetchKDSRef.current(), 1500);

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

  // 2026-10-02 (12g, owner): "in place yox — elementin MORPH edərək ekranın
  // ortasında modal kimi açılması" — the tapped ticket lives in a centered
  // modal (POS product-grid tick transition); the grid slot keeps an
  // invisible placeholder. ESC closes.
  const expandedOrder = orders.find(o => o.id === expandedId) || null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col h-full">
       {/* Header — 12h (Apple reset, visual direction §4 "no decorative UI"):
           the icon tile is gone; chrome = title + count + quiet controls. */}
       <div className={`flex items-center justify-between flex-shrink-0 pb-4 border-b ${lightMode ? 'border-zinc-200' : 'border-white/[0.06]'}`}>
         <div>
           <p className={`text-[17px] font-semibold tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{stationType ? t('bds_bar_screen') : t('kds_screen')}</p>
           <p className={`text-xs font-medium mt-0.5 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{boardOrders.length} {t('active_orders_short')}</p>
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
         // 12h: text-only tabs (iOS segmented feel) — no icons, no borders,
         // no RED count badges (red is reserved for delay semantics).
         <div className="flex items-center gap-1 flex-shrink-0 px-0.5 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
           <button
             type="button"
             onClick={() => setStationFilter(null)}
             className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold tabular-nums transition-colors ${stationFilter === null ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-950') : (lightMode ? 'text-zinc-500 hover:text-zinc-800' : 'text-white/45 hover:text-white/75')}`}
           >
             {t('kds_all_stations')}
             <span className={`ml-1.5 ${stationFilter === null ? '' : (lightMode ? 'text-zinc-400' : 'text-white/30')}`}>{orders.length}</span>
           </button>
           {boardStations.map(st => {
             const pending = stationPendingCount(st.id);
             const active = stationFilter === st.id;
             return (
               <button
                 key={st.id}
                 type="button"
                 onClick={() => setStationFilter(active ? null : st.id)}
                 className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold tabular-nums transition-colors ${active ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-950') : (lightMode ? 'text-zinc-500 hover:text-zinc-800' : 'text-white/45 hover:text-white/75')}`}
               >
                 {st.name}
                 {pending > 0 && <span className={`ml-1.5 ${active ? '' : (lightMode ? 'text-zinc-400' : 'text-white/30')}`}>{pending}</span>}
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
                 // 12f: per-station progress for the in-place detail block —
                 // ALL stations of the order (the chef sees the whole picture
                 // when the ticket is expanded, not just the visible board).
                 const stationProgress: { name: string; qty: number; ready: number }[] = (() => {
                   const m = new Map<string, { name: string; qty: number; ready: number }>();
                   for (const it of order.items) {
                     if ((it.quantity ?? 0) <= 0) continue;
                     const st = itemStation(it);
                     const nm = st ? (stations.find(s => s.id === st)?.name || 'Main Kitchen') : (stationType ? null : 'Main Kitchen');
                     if (!nm) continue;
                     const e = m.get(nm) || { name: nm, qty: 0, ready: 0 };
                     e.qty += it.quantity;
                     if (isItemReady(it)) e.ready += it.quantity;
                     m.set(nm, e);
                   }
                   return Array.from(m.values());
                 })();
                  const isExpanded = expandedId === order.id;
                  // 12h (owner: "çirkin görünüşdə saxlamayaq" — full Apple reset,
                  // SAITO_UI_VISUAL_DIRECTION §4/§5): NO badge spam, NO tinted
                  // boxes. State lives in the border + the timer text; the rest
                  // is typography. Delay = red timer (GEÇİKME adds a dot).
                  const timerLate = timer.color === 'red' || timer.color === 'purple';
                  const cardCls = `relative overflow-hidden rounded-4xl border p-4 transition-colors duration-300 ${
                    allItemsReady
                      ? (lightMode ? 'border-emerald-500/50 bg-white shadow-card' : 'border-emerald-500/40 bg-white/[0.02] shadow-card')
                      : timer.color === 'purple'
                        ? (lightMode ? 'border-red-400 bg-white shadow-card' : 'border-red-500/45 bg-white/[0.02] shadow-card')
                        : timer.color === 'red'
                          ? (lightMode ? 'border-red-300 bg-white shadow-card' : 'border-red-500/35 bg-white/[0.02] shadow-card')
                          : (lightMode ? 'border-zinc-200 bg-white shadow-card' : 'border-white/[0.08] bg-white/[0.02] shadow-card')
                  }`;
                  // One quiet meta line: source word · phone (dine-in has none).
                  const titleIsFallback = order.order_source !== 'dine_in' && !order.customer_name;
                  const metaLine = [
                    titleIsFallback ? '' : (order.order_source === 'takeaway' ? t('takeaway_short') : order.order_source === 'delivery' ? t('delivery_short') : '').toLowerCase(),
                    order.order_source !== 'dine_in' ? (order.customer_phone || '') : '',
                  ].filter(Boolean).join('  ·  ');
                  return (
                    <Fragment key={order.id}>
                     {isExpanded ? (
                       // Invisible placeholder: reserves the card's height while
                       // the ticket lives in the modal (ProductGrid pattern —
                       // only ONE layoutId element in the tree at a time, so no
                       // "crossfade restore" glitch can happen).
                       <div aria-hidden className="relative opacity-0 pointer-events-none select-none">
                         <div className={`rounded-4xl border p-4 ${lightMode ? 'border-zinc-200' : 'border-white/[0.08]'}`}>
                           <div className="h-[20px] mb-1" />
                           {metaLine && <div className="h-[15px] mb-3" />}
                           <div className="space-y-1.5">
                             {visibleItems.map(it => <div key={it.id} className="h-[34px]" />)}
                           </div>
                           {order.customer_note && <div className="h-[15px] mt-2.5" />}
                           {allItemsReady && <div className="h-[40px] mt-3" />}
                         </div>
                       </div>
                     ) : (
                     <motion.div
                       layout
                       layoutId={`kds-ticket-${order.id}`}
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, scale: 0.98 }}
                       transition={reduceMotion ? { duration: 0 } : CARD_SPRING}
                       whileTap={{ scale: 0.965, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
                       // 12g: tap = the card MORPHS into the centered ticket
                       // modal (POS product-grid tick transition, same spring).
                       onClick={() => setExpandedId(order.id)}
                       className={`cursor-pointer ${cardCls}`}
                     >
                      {/* Row 1 — title + timer (delay = red text + dot, NO chip) */}
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-[15px] font-semibold tracking-tight truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                          {order.order_source === 'dine_in' ? `Masa ${order.table_number ?? '?'}` : order.customer_name || (order.order_source === 'takeaway' ? t('takeaway_short') : t('delivery_short'))}
                        </span>
                        <span className="flex items-baseline gap-1.5 shrink-0">
                          {stationFilter && visibleItems.length > 1 && (
                            <span className={`text-[11px] font-semibold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{visibleReady}/{visibleItems.length}</span>
                          )}
                          <span className={`flex items-center gap-1.5 text-[13px] font-semibold tabular-nums ${timerLate ? (lightMode ? 'text-red-500' : 'text-red-400') : (lightMode ? 'text-zinc-400' : 'text-white/35')}`}>
                            {timer.color === 'purple' && <span className={`w-1.5 h-1.5 rounded-full ${lightMode ? 'bg-red-500' : 'bg-red-400'}`} />}
                            {formatElapsedMin(timer.elapsed)}
                          </span>
                        </span>
                      </div>
                      {/* Row 2 — quiet meta (source · phone) */}
                      {metaLine && (
                        <p className={`mt-1 text-[11px] font-medium truncate ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{metaLine}</p>
                      )}

                      {/* Items — 12h: FLAT rows on hairline dividers (no boxes,
                          no tint). name + one quiet spec line — the special
                          note wins over modifiers on the card; the FULL spec
                          (modifiers with ₼, allergens, course) lives in the
                          modal. 40px ✓ targets kept (kitchen tablets). */}
                      <div className={`${metaLine ? 'mt-2.5' : 'mt-3'} divide-y ${lightMode ? 'divide-zinc-100' : 'divide-white/[0.05]'}`}>
                        {visibleItems.map(item => {
                          const itemReady = item.kitchen_status === 'ready' || item.kitchen_status === 'completed';
                          // Modifier names with quantities — "add 2 cheese" must
                          // reach the kitchen as "Cheese ×2", not "Cheese".
                          const modText = (item.modifiers ?? [])
                            .map(m => (m.quantity && m.quantity > 1 ? `${m.name} ×${m.quantity}` : m.name))
                            .join(', ');
                          const alLabels = parseAllergens(item.allergens).map((a: any) =>
                            resolveAllergenEntry(a)?.label ||
                            (a && typeof a === 'object' ? (a.name || a.code || '') : String(a))
                          ).filter(Boolean);
                          return (
                            <div key={item.id} className="flex items-center justify-between gap-2 py-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-[13px] font-medium truncate ${itemReady ? (lightMode ? 'text-zinc-400' : 'text-white/35') : (lightMode ? 'text-zinc-800' : 'text-white/85')}`}>
                                    {item.name}
                                  </span>
                                  {item.is_hold && (
                                    <span className={`text-[9px] font-bold tracking-wider shrink-0 ${lightMode ? 'text-amber-600' : 'text-amber-400'}`}>HOLD</span>
                                  )}
                                  {item.course && (
                                    <span className={`text-[9px] font-semibold uppercase tracking-wider shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{item.course}</span>
                                  )}
                                  {/* 2026-09-28: per-instance ALLERGEN flags —
                                      red text (safety), no box. */}
                                  {alLabels.length > 0 && (
                                    <span className={`text-[9px] font-bold shrink-0 ${lightMode ? 'text-red-500' : 'text-red-400'}`}>⚠ {alLabels.join(' · ')}</span>
                                  )}
                                </div>
                                {(item.special_notes || modText) && (
                                  <p className={`text-[11px] truncate mt-0.5 ${item.special_notes ? (lightMode ? 'text-amber-600' : 'text-amber-400/90') : (lightMode ? 'text-zinc-400' : 'text-white/30')}`}>
                                    {item.special_notes || modText}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className={`text-xs font-semibold tabular-nums ${itemReady ? (lightMode ? 'text-zinc-300' : 'text-white/25') : (lightMode ? 'text-zinc-400' : 'text-white/40')}`}>×{item.quantity}</span>
                                {!itemReady ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleItemStatus(order.id, item.id, 'ready'); }}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold border transition-all active:scale-90 ${lightMode ? 'border-zinc-300 text-zinc-400 hover:border-emerald-500 hover:text-emerald-600' : 'border-white/20 text-white/40 hover:border-emerald-400 hover:text-emerald-400'}`}
                                  >
                                    ✓
                                  </button>
                                ) : (
                                  <span className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold ${lightMode ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-zinc-950'}`}>✓</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                     {/* Customer note — plain amber text (no box) */}
                     {order.customer_note && (
                       <p className={`mt-2.5 text-[11px] font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>{order.customer_note}</p>
                     )}

                     {/* Action — whole-order invariant (unchanged): the
                         complete button appears only when EVERY station's
                         items are ready. Station board done-but-others-pending
                         = quiet text, not a disabled box. */}
                     {allItemsReady ? (
                       <motion.button
                         initial={{ opacity: 0, y: 4 }}
                         animate={{ opacity: 1, y: 0 }}
                         transition={reduceMotion ? { duration: 0 } : CARD_SPRING}
                         onClick={(e) => { e.stopPropagation(); handleMarkReady(order.id); }}
                         className={`mt-3 w-full h-10 rounded-2xl text-[13px] font-semibold transition-all active:scale-[0.99] ${lightMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'}`}
                       >
                         {t('complete_order')}
                       </motion.button>
                     ) : stationFilter && visibleAllReady && otherPending > 0 ? (
                       <p className={`mt-2.5 text-[11px] font-semibold ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                         {t('kds_other_stations_pending')} · {otherPending}
                       </p>
                     ) : null}
                    </motion.div>
                    )}
                  </Fragment>
                 );
               })}
            </AnimatePresence>
          </div>
         )}
       </div>

      {/* ══════════════════════════════════════════════════════════════
          12g — TİCKET MODALI (owner): the tapped card MORPHS (layoutId,
          POS product-grid tick transition — the same spring 300/30/0.8)
          into this centered surface: full item list with 48px ✓ targets,
          full modifiers, notes, customer, stations, ETA. Sticky footer.
          ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {expandedOrder && (() => {
          const o = expandedOrder;
          const timer = getItemTimerStatus(o.created_at, Math.max(1, Math.round(delayMin / 2)), delayMin);
          const items = o.items.filter(i => (i.quantity ?? 0) > 0 && !['completed', 'cancelled', 'voided'].includes(i.kitchen_status));
          const allReady = items.length > 0 && items.every(isItemReady);
          const stationMap = new Map<string, { name: string; qty: number; ready: number }>();
          for (const it of items) {
            const st = itemStation(it);
            const nm = st ? (stations.find(s => s.id === st)?.name || 'Main Kitchen') : 'Main Kitchen';
            const e = stationMap.get(nm) || { name: nm, qty: 0, ready: 0 };
            e.qty += it.quantity;
            if (isItemReady(it)) e.ready += it.quantity;
            stationMap.set(nm, e);
          }
          const title = o.order_source === 'dine_in' ? `Masa ${o.table_number ?? '?'}` : o.customer_name || (o.order_source === 'takeaway' ? t('takeaway_short') : t('delivery_short'));
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : appleBackdrop}
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
              onClick={() => setExpandedId(null)}
            >
              <motion.div
                layoutId={`kds-ticket-${o.id}`}
                transition={reduceMotion ? { duration: 0 } : MORPH_SPRING}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                onClick={e => e.stopPropagation()}
                 className={`w-full max-w-[640px] max-h-[92vh] flex flex-col rounded-4xl border shadow-elevated overflow-hidden ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
               >
                 {/* Header — 12h: title + ONE quiet meta line (source · phone ·
                     timer in state color). No pills. X + print = ghost icons. */}
                 <div className={`flex flex-shrink-0 items-start justify-between gap-3 p-5 pb-4 border-b ${lightMode ? 'border-zinc-100' : 'border-white/[0.07]'}`}>
                   <div className="min-w-0 flex-1">
                     <div className="flex items-center gap-2.5 min-w-0">
                       <h2 className={`text-xl font-semibold tracking-tight truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{title}</h2>
                       <PartnerLogo source={o.partner_source} height={18} lightMode={lightMode} />
                     </div>
                     <div className="flex items-center gap-2.5 mt-1.5 min-w-0">
                       {o.order_source !== 'dine_in' && !o.customer_name && (
                         <span className={`text-xs font-medium ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                           {o.order_source === 'takeaway' ? t('takeaway_short').toLowerCase() : t('delivery_short').toLowerCase()}
                         </span>
                       )}
                       {o.customer_phone && (
                         <a href={`tel:${o.customer_phone}`} className={`text-xs font-semibold tabular-nums ${lightMode ? 'text-zinc-500' : 'text-white/45'}`}>{o.customer_phone}</a>
                       )}
                       <span className={`flex items-center gap-1.5 text-xs font-semibold tabular-nums shrink-0 ${timer.color === 'green' ? (lightMode ? 'text-zinc-400' : 'text-white/35') : (lightMode ? 'text-red-500' : 'text-red-400')}`}>
                         {timer.color === 'purple' && <span className={`w-1.5 h-1.5 rounded-full ${lightMode ? 'bg-red-500' : 'bg-red-400'}`} />}
                         {formatElapsedMin(timer.elapsed)}
                         {(timer.color === 'red' || timer.color === 'purple') && (
                           <span className="text-[10px] font-bold uppercase tracking-wider">{timer.text}</span>
                         )}
                       </span>
                       <button
                         type="button"
                         onClick={() => reprintTicket(o)}
                         title="Bileti yenidən çap et"
                         className={`ml-auto shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${lightMode ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600' : 'text-white/35 hover:bg-white/[0.06] hover:text-white/70'}`}
                       >
                         <Printer size={14} />
                       </button>
                     </div>
                   </div>
                   <motion.button
                     onClick={() => setExpandedId(null)}
                     whileHover={{ rotate: 90, scale: 1.06 }}
                     whileTap={{ scale: 0.82 }}
                     transition={CARD_SPRING}
                     aria-label="Bağla"
                     className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${lightMode ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700' : 'text-white/40 hover:bg-white/[0.06] hover:text-white/80'}`}
                   >
                     <X size={18} />
                   </motion.button>
                 </div>

                 {/* Body — 12h: flat sections on hairline dividers, no boxes
                     inside boxes. The full spec stays (modifiers + ₼,
                     allergens, notes) — now as quiet typography. */}
                 <div className="p-5 flex-1 min-h-0 overflow-y-auto">
                   {/* Məhsullar — flat rows, 48px ✓ targets */}
                   <div className={`divide-y ${lightMode ? 'divide-zinc-100' : 'divide-white/[0.06]'}`}>
                     {items.map(item => {
                       const itemReady = isItemReady(item);
                       const modText = (item.modifiers ?? []).map(m =>
                         `${m.name}${(m.quantity && m.quantity > 1) ? ` ×${m.quantity}` : ''}${(m.price ?? 0) > 0 ? ` · ₼${Number(m.price).toFixed(2).replace(/\.?0+$/, '')}` : ''}`
                       ).join(', ');
                       const alLabels = parseAllergens(item.allergens).map((a: any) =>
                         resolveAllergenEntry(a)?.label ||
                         (a && typeof a === 'object' ? (a.name || a.code || '') : String(a))
                       ).filter(Boolean);
                       return (
                         <div key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                           <div className="min-w-0 flex-1">
                             <div className="flex items-center gap-2 flex-wrap">
                               <span className={`text-sm font-semibold ${itemReady ? (lightMode ? 'text-zinc-400' : 'text-white/35') : (lightMode ? 'text-zinc-900' : 'text-white/90')}`}>{item.name}</span>
                               {item.is_hold && <span className={`text-[10px] font-bold tracking-wider ${lightMode ? 'text-amber-600' : 'text-amber-400'}`}>HOLD</span>}
                               {item.course && <span className={`text-[10px] font-semibold uppercase tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{item.course}</span>}
                               {alLabels.length > 0 && <span className={`text-[10px] font-bold ${lightMode ? 'text-red-500' : 'text-red-400'}`}>⚠ {alLabels.join(' · ')}</span>}
                             </div>
                             {modText && <p className={`mt-1 text-xs ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{modText}</p>}
                             {item.special_notes && <p className={`mt-1 text-xs font-medium ${lightMode ? 'text-amber-600' : 'text-amber-400/90'}`}>{item.special_notes}</p>}
                           </div>
                           <div className="flex items-center gap-3 shrink-0 pt-0.5">
                             <span className={`text-sm font-semibold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>×{item.quantity}</span>
                             {!itemReady ? (
                               <button
                                 onClick={() => handleItemStatus(o.id, item.id, 'ready')}
                                 className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border transition-all active:scale-90 ${lightMode ? 'border-zinc-300 text-zinc-400 hover:border-emerald-500 hover:text-emerald-600' : 'border-white/20 text-white/35 hover:border-emerald-400 hover:text-emerald-400'}`}
                               >
                                 ✓
                               </button>
                             ) : (
                               <span className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${lightMode ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-zinc-950'}`}>✓</span>
                             )}
                           </div>
                         </div>
                       );
                     })}
                   </div>

                   {/* Müştəri — flat section */}
                   {o.order_source !== 'dine_in' && (
                     <section className="mt-5">
                       <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('kds_customer')}</p>
                       <div className="flex items-center justify-between gap-3">
                         <span className={`text-sm font-semibold truncate ${lightMode ? 'text-zinc-800' : 'text-white/80'}`}>{o.customer_name || '—'}</span>
                         {o.customer_phone && (
                           <a href={`tel:${o.customer_phone}`} className={`text-sm font-medium tabular-nums shrink-0 ${lightMode ? 'text-blue-600' : 'text-blue-400'}`}>{o.customer_phone}</a>
                         )}
                       </div>
                       {o.customer_note && (
                         <p className={`mt-2 text-[13px] font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>{o.customer_note}</p>
                       )}
                     </section>
                   )}

                   {/* Stansiyalar — whole-order progress, flat rows */}
                   {stationMap.size > 0 && (
                     <section className="mt-5">
                       <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] mb-1 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('kds_stations')}</p>
                       <div className={`divide-y ${lightMode ? 'divide-zinc-100' : 'divide-white/[0.06]'}`}>
                         {Array.from(stationMap.values()).map(g => {
                           const done = g.ready >= g.qty;
                           return (
                             <div key={g.name} className="flex items-center justify-between py-2.5">
                               <span className={`text-[13px] font-medium ${lightMode ? 'text-zinc-700' : 'text-white/70'}`}>{g.name}</span>
                               <span className={`text-[13px] font-semibold tabular-nums ${done ? (lightMode ? 'text-emerald-600' : 'text-emerald-400') : (lightMode ? 'text-zinc-400' : 'text-white/40')}`}>{g.ready}/{g.qty}</span>
                             </div>
                           );
                         })}
                       </div>
                     </section>
                   )}

                   {/* ETA — plain line, red once overdue */}
                   {o.estimated_delivery_time && (() => {
                     const eta = new Date(o.estimated_delivery_time);
                     if (Number.isNaN(eta.getTime())) return null;
                     const overdue = eta.getTime() < Date.now();
                     return (
                       <p className={`mt-5 text-xs font-semibold tabular-nums ${overdue ? (lightMode ? 'text-red-500' : 'text-red-400') : (lightMode ? 'text-zinc-400' : 'text-white/35')}`}>
                         ETA {eta.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                       </p>
                     );
                   })()}
                 </div>

                 {/* Sticky footer — the action is always visible (POS pattern) */}
                 <div className="p-5 pt-0 flex-shrink-0">
                   {allReady ? (
                     <button
                       onClick={() => handleMarkReady(o.id)}
                       className={`w-full h-12 rounded-2xl text-sm font-semibold transition-all active:scale-[0.99] ${lightMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'}`}
                     >
                       {t('complete_order')}
                     </button>
                   ) : (
                     <p className={`text-center text-[11px] font-semibold uppercase tracking-[0.12em] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('kds_check_items')}</p>
                   )}
                 </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
     </div>
   );
 }
