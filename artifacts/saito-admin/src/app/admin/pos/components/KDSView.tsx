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
  order_number?: string | null;
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
  /** 12i: workflow timestamps (rollup-stamped by the frozen RPCs).
   *  kitchen_ready_at drives the 3 s HAZIRDIR → SERVİSƏ flip (derived). */
  kitchen_ready_at?: string | null;
  kitchen_accepted_at?: string | null;
}

// 12i (owner): "metbex hazırdır basanda status uje hazırdır, 2-3 saniyə sonra
// çevrilir serve" — the SERVE display state is DERIVED (no cron, no worker):
// order ready (rollup) + kitchen_ready_at ≥3 s old → "serving" on the UI.
const SERVE_LAG_MS = 3000;

type KdsWorkflow = 'pending' | 'preparing' | 'ready' | 'serving' | 'served';

/** 12i: canonical kitchen workflow, derived from the FROZEN state machine
 *  (items: pending→ready→served; order rollup: accepted/preparing/
 *  partially_ready/ready/served). The UI never invents states — it projects. */
function kdsWorkflowState(
  o: KDSOrder,
  isItemReady: (i: KDSItem) => boolean,
  now: number,
): KdsWorkflow {
  const active = o.items.filter(i => (i.quantity ?? 0) > 0 && !['completed', 'cancelled', 'voided'].includes(i.kitchen_status));
  if (active.length === 0) return 'pending';
  const allServed = active.every(i => i.kitchen_status === 'served' || i.kitchen_status === 'completed');
  if (allServed || o.kitchen_status === 'served') return 'served';
  const allReady = active.every(isItemReady);
  if (allReady || o.kitchen_status === 'ready') {
    const readyAt = o.kitchen_ready_at ? new Date(o.kitchen_ready_at).getTime() : null;
    if (readyAt && now - readyAt >= SERVE_LAG_MS) return 'serving';
    return 'ready';
  }
  if (['accepted', 'sent', 'preparing', 'partially_ready'].includes(o.kitchen_status)) return 'preparing';
  return 'pending';
}

// 12i: workflow status label + state color (visual direction: state = text
// color only — emerald = done family, zinc = in-flight, no chips).
function wfMetaFor(wf: KdsWorkflow, lightMode: boolean): { key: string; cls: string } {
  switch (wf) {
    case 'pending':   return { key: 'kds_st_waiting',  cls: lightMode ? 'text-zinc-400' : 'text-white/35' };
    case 'preparing': return { key: 'kds_st_preparing', cls: lightMode ? 'text-zinc-500' : 'text-white/45' };
    case 'ready':     return { key: 'kds_st_ready',    cls: lightMode ? 'text-emerald-600' : 'text-emerald-400' };
    case 'serving':   return { key: 'kds_st_serving',  cls: lightMode ? 'text-emerald-600' : 'text-emerald-400' };
    case 'served':    return { key: 'kds_st_served',   cls: lightMode ? 'text-emerald-600' : 'text-emerald-400' };
  }
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
  // 12i: 1 s tick — the HAZIRDIR → SERVİSƏ flip (3 s, derived from
  // kitchen_ready_at) and the elapsed timer must not wait for the 5 s poll.
  // Board is small (≤ a dozen tickets); a per-second re-render is exactly
  // what a kitchen terminal is for. tabular-nums keeps the digits from
  // jittering (no "blink" on the timer).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // 12j (owner: "tik ikonuna POS-dakı kimi transition"): the POS ProductGrid
  // cart-badge pattern, bit-tibi — a PERSISTENT element that BOUNCES
  // (scale keyframes [1, 1.18, 1.04, 1], ~0.45 s easeOut) on every tap,
  // driven by a pulseMap that is set on tap and cleared after 700 ms. No
  // AnimatePresence, no initial-opacity, no key-remount → zero blink.
  const [tickPulse, setTickPulse] = useState<Record<string, number>>({});
  const pulseTick = useCallback((id: string) => {
    setTickPulse(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setTimeout(() => {
      setTickPulse(prev => { const n = { ...prev }; delete n[id]; return n; });
    }, 700);
  }, []);
  // 12j (owner, from the Toast comparison): "GÜN" (All Day) view — all-day
  // tickets + production counts + kitchen productivity (one light read,
  // refreshed every 30 s while open).
  const [dayView, setDayView] = useState(false);
  const [dayData, setDayData] = useState<any | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  // 12n (owner): "mətbəxdə umumi olsun, 2 ayrı tab YOX — yuxarıda navbar
  // olsun, hər birinə baxmaq üçün" — ONE unified board; the TOP NAVBAR
  // (Main Kitchen · Bar · GÜN — HAMISI stays removed per 12m) switches the
  // station. Ready tickets (this station's whole share done) sit at the TOP
  // of the board with an emerald border — no HAZIRLANIR|HAZIRDİR split
  // (Toast model, owner-approved 12n).
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  // 12m (owner: "soldakı məhsullara klikləyəndə arxadakı məhsulların
  // hərəkət etməsi və ya collapse olması"): the modal placeholder used to be
  // an ESTIMATED height (34px/item) — multi-line spec cards are taller, so
  // opening a ticket reflowed the whole grid behind. Now the card's REAL
  // height is measured on click and the placeholder gets it exactly → zero
  // reflow.
  const cardEls = useRef<Record<string, HTMLElement | null>>({});
  const [placeholderH, setPlaceholderH] = useState<Record<string, number>>({});
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

  // 12m — DUAL STATION BOARD helpers. One ticket lives in exactly ONE tab of
  // its station panel (owner: "eyni sifariş iki tabda görünərək çaşqınlıq
  // yaratmasın"): HAZIRLANİR = the station still owes work; HAZIRDİR = every
  // station item is done (ready/served) and the ticket waits for the POS
  // floor to serve (there is NO serve button on the kitchen side — 12i).
  const isActiveItem = (i: KDSItem) =>
    (i.quantity ?? 0) > 0 && !['completed', 'cancelled', 'voided'].includes(i.kitchen_status);
  const stationItems = (o: KDSOrder, stId: string) => o.items.filter(i => itemStation(i) === stId && isActiveItem(i));
  const stationDone = (i: KDSItem) => isItemReady(i) || i.kitchen_status === 'served';
  // 12o (owner: "tik oğlanda avtomatik hazırdır qəbul etməsin sistem") — the
  // per-item ✓ is PREPARATION PROGRESS: a tick lights the circle and counts
  // toward "done" via order_items.prepared_quantity WITHOUT touching
  // kitchen_status (no auto-accept, no auto-ready, rollup keeps the same
  // order status). Declaring HAZIRDIR stays the "Hazırdır" CTA's job;
  // un-declaring stays RECALL (ready→pending, frozen edge).
  const isItemTicked = (i: KDSItem) => stationDone(i) || (i.prepared_quantity ?? 0) > 0;
  const stationAllDone = (o: KDSOrder, stId: string) => {
    const its = stationItems(o, stId);
    return its.length > 0 && its.every(stationDone);
  };
  const stationTickets = (stId: string) => orders
    .filter(o => o.items.some(i => itemStation(i) === stId && isActiveItem(i)))
    // 12m: a fully served order leaves the board (floor chip = SERVİS EDİLDİ;
    // GÜN keeps the full-day history). It must not linger in HAZIRDİR.
    .filter(o => kdsWorkflowState(o, isItemReady, nowMs) !== 'served');
  // 12m: "Hazırdır" on a station panel marks ONLY that station's remaining
  // items ready (the bar can finish drinks while the hot kitchen still
  // cooks). The whole-order variant (item_ids = null) stays on the ticket
  // MODAL only — the one-tap whole-order surface.
  const stationPendingItemIds = (o: KDSOrder, stId: string) =>
    stationItems(o, stId).filter(i => !stationDone(i)).map(i => i.id);
  // 12m: the header count = unique orders visible across ALL panels.
  const boardOrderIds = new Set<string>();
  boardStations.forEach(st => stationTickets(st.id).forEach(o => boardOrderIds.add(o.id)));

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
            // 12i: workflow timestamps — the HAZIRDIR→SERVİSƏ flip is derived
            // from kitchen_ready_at (stamped by mark_item_ready_atomic).
            kitchen_ready_at: o.kitchen_ready_at ?? null,
            kitchen_accepted_at: o.kitchen_accepted_at ?? null,
            order_number: o.order_number ?? null,
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

  // 12j: "GÜN" (All Day) data — fetched while the tab is open, refreshed
  // every 30 s (a day-view is a slow surface, not a live board).
  useEffect(() => {
    if (!dayView) return;
    let live = true;
    const load = async () => {
      setDayLoading(true);
      try {
        const res = await apiFetch('/api/kitchen/daily');
        if (!res.ok) return;
        const d = await res.json();
        if (live) setDayData(d);
      } catch {}
      if (live) setDayLoading(false);
    };
    load();
    const id = setInterval(load, 30000);
    return () => { live = false; clearInterval(id); };
  }, [dayView]);

  // 2026-09-26 (Task 53 P0-2 realtime): KDS/BDS was the last major board on
  // poll-only sync (5s). Now orders/order_items row changes push a debounced
  // refetch (~1.5s coalescing) — sub-second ticket appearance across
  // terminals, Toast-style. The 5s poll stays as the safety fallback (same
  // defense-in-depth pattern as pos-sync).
  useCrossTableRefresh('kdsview', ['orders', 'order_items'], () => fetchKDSRef.current(), 1500);

  // 12i→12j: the ✓ was a TOGGLE on kitchen_status (tick = mark_item_ready_
  // atomic). 12o (owner: "tik oğlanda avtomatik hazırdır qəbul etməsin
  // sistem"): a tick on a NON-ready item no longer touches the state machine
  // at all — it writes order_items.prepared_quantity (preparation progress,
  // /api/kitchen/item-prepared). Only the UN-TICK of a declared-READY item
  // stays RECALL (item_kitchen_terminal 'recalled', ready→pending — frozen
  // registry edge, 12i). Served items are final (no toggle). Optimistic
  // update + rollback of BOTH fields on failure.
  const handleItemToggle = async (orderId: string, item: KDSItem) => {
    const recall = item.kitchen_status === 'ready';
    const prevStatus = item.kitchen_status;
    const prevPrepared = item.prepared_quantity ?? 0;
    // recall → circle fully off (progress reset too); otherwise toggle the
    // prepared mark (0 ↔ quantity).
    const nextPrepared = recall ? 0 : (prevPrepared > 0 ? 0 : (item.quantity ?? 1));
    // 12j: POS cart-badge bounce on the tap itself (instant, before the RPC).
    pulseTick(item.id);
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      items: o.items.map(i => i.id === item.id ? {
        ...i,
        ...(recall ? { kitchen_status: 'pending' as const } : {}),
        prepared_quantity: nextPrepared,
      } : i),
    } : o));
    const rollback = () => setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      items: o.items.map(i => i.id === item.id ? { ...i, kitchen_status: prevStatus, prepared_quantity: prevPrepared } : i),
    } : o));
    try {
      const res = recall
        ? await apiFetch('/api/kitchen/item-recall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_item_id: item.id }),
          })
        : await apiFetch('/api/kitchen/item-prepared', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_item_id: item.id, prepared_quantity: nextPrepared }),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        rollback();
        toast.error(d?.error || t('status_update_error'), { id: 'kds-toast' });
        return;
      }
      // legacy safety: a READY item that somehow carried prep progress loses
      // it on recall (mark_item_ready_atomic itself never sets the column).
      if (recall && prevPrepared > 0) {
        await apiFetch('/api/kitchen/item-prepared', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_item_id: item.id, prepared_quantity: 0 }),
        }).catch(() => {});
      }
    } catch {
      rollback();
      toast.error(t('status_update_error'), { id: 'kds-toast' });
    }
  };

  // 12i workflow handlers — the ticket NEVER leaves the board optimistically
  // (the old handleMarkReady removed it on "Sifarişi Tamamla", but the DB
  // order only becomes 'ready' — the next poll brought the ticket BACK:
  // the "tamamla → itir → geri" blink the owner reported). Now: state flips
  // in place, and the board refetch confirms.
  const patchOrder = (orderId: string, fn: (o: KDSOrder) => Partial<KDSOrder>) => {
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, ...fn(o) } : o)));
  };

  // 12p (owner): "bir dəfə qəbul et, ondan sonra görünməsin — əlavə qəbul
  // et-ə ehtiyac yoxdur" — the "Qəbul et" button is GONE (card pill + modal
  // footer). The terminal ACCEPTS each pending order ONCE, automatically,
  // the moment it sees it (initial fetch / 5 s poll / realtime refetch):
  // the order lands straight into HAZIRLANIR, in the button's place.
  //   • fired once per order per session (acceptedRef Set);
  //   • SILENT — no toast (it is not a user action);
  //   • on failure: re-armed for the next tick; worst case the order stays
  //     GÖZLƏYİR and the "Hazırdır" CTA still reaches ready from pending —
  //     no dead end.
  const acceptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const o of orders) {
      if (o.kitchen_status !== 'pending') continue;
      if (acceptedRef.current.has(o.id)) continue;
      acceptedRef.current.add(o.id);
      void (async () => {
        try {
          const res = await apiFetch('/api/kitchen/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: o.id }),
          });
          if (res.ok) {
            patchOrder(o.id, () => ({
              kitchen_status: 'accepted',
              kitchen_accepted_at: new Date().toISOString(),
            }));
          } else {
            acceptedRef.current.delete(o.id);
            console.warn('[KDS 12p] auto-accept failed:', o.id, res.status);
          }
        } catch (e) {
          acceptedRef.current.delete(o.id);
          console.warn('[KDS 12p] auto-accept failed:', o.id, e);
        }
      })();
    }
  }, [orders]);

  // "Hazırdır" — NO forced per-item tick (owner: "sifariş tamamlamaq üçün
  // məcburi tika basmaq olmamalıdır"). 12m: STATION-SCOPED — item_ids given
  // (the panel's own remaining items only) → mark_item_ready_atomic reads
  // those; null (ticket MODAL) = whole order, the one-tap surface.
  const handleMakeReady = async (orderId: string, itemIds?: string[]) => {
    try {
      const res = await apiFetch('/api/orders/mark-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemIds ? { order_id: orderId, item_ids: itemIds } : { order_id: orderId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error || t('status_update_error'), { id: 'kds-toast' });
        return;
      }
      const ts = new Date().toISOString();
      const idSet = itemIds ? new Set(itemIds) : null;
      patchOrder(orderId, o => ({
        items: o.items.map(i =>
          (i.quantity ?? 0) > 0 && !['served', 'completed', 'cancelled', 'voided'].includes(i.kitchen_status)
            && (!idSet || idSet.has(i.id))
            ? { ...i, kitchen_status: 'ready' } : i),
        // whole-order press stamps ready (rollup will confirm on refetch);
        // station-scoped press never fakes the order rollup.
        ...(idSet ? {} : { kitchen_status: 'ready' as const, kitchen_ready_at: ts }),
      }));
      toast.success(`${t('order_ready')}!`, { id: 'kds-toast' });
    } catch {
      toast.error(t('status_update_error'), { id: 'kds-toast' });
    }
  };

  // NOTE 12i (owner): the SERVE ("Sərvil") press is a FLOOR/POS action, not a
  // kitchen one — see /api/orders/serve, wired to the POS "Servisə Ver". The
  // KDS ends at "Hazırdır"; the board then reads SERVİSƏ HAZIRDIR until the
  // floor serves (kitchen rollup → 'served').

  // 12n — BDS #28's station scoping survives: a ticket lists ONLY its items
  // for the ACTIVE station (selected on the top navbar), and "Hazırdır" is
  // station-scoped (the whole-order one-tap lives on the ticket modal).

  // 2026-10-02 (12g, owner): "in place yox — elementin MORPH edərək ekranın
  // ortasında modal kimi açılması" — the tapped ticket lives in a centered
  // modal (POS product-grid tick transition); the grid slot keeps an
  // invisible placeholder. ESC closes.

  // 12n — TICKET (one station's view of an order, unified board):
  //  - lists ONLY that station's items (cross-station awareness stays on the
  //    progress line: "Main Kitchen 1/2 · Bar 2/2");
  //  - in-progress: "Qəbul et" = a small quiet pill up top (owner 12m: the
  //    less-used action gets a comfortable spot, NOT the CTA bar); "Hazırdır"
  //    = the main CTA, STATION-SCOPED (item_ids of this station only), 12j
  //    persistent pattern (no blink);
  //  - when this station's items all become ready, the ticket MOVES to the
  //    top of the board (ready section, emerald border) and goes read-only
  //    (one ticket, one place — owner 12m); SERVE is the POS floor action
  //    (12i), no kitchen serve button;
  //  - source (İçəridə/Çatdırılma/Gel-Al) = Apple chip w/ icon; course +
  //    allergens = chips; modifiers = price-less chips; notes = "Qeyd: xxx"
  //    (the word "Qeyd" as a separate bold label); NO prices anywhere
  //    (owner 12m);
  //  - click = measure the card's REAL height → the modal placeholder gets
  //    it exactly → the grid behind NEVER reflows (owner 12m: the
  //    "collapse behind" bug — the old placeholder was an estimate).
  const renderTicket = (order: KDSOrder, stId: string) => {
    const criticalMin = Math.max(1, Math.round(delayMin / 2));
    const timer = getItemTimerStatus(order.created_at, criticalMin, delayMin);
    const wf = kdsWorkflowState(order, isItemReady, nowMs);
    const visibleItems = stationItems(order, stId);
    // 12o: progress = TICKED (prepared_quantity) + declared-ready + served.
    const visibleReady = visibleItems.filter(i => isItemTicked(i)).length;
    // 12n: "ready section" membership — this station's whole share DECLARED
    // done (kitchen_status truth only — a tick alone never promotes a card).
    const inReadyTab = stationAllDone(order, stId);
    const timerLate = timer.color === 'red' || timer.color === 'purple';
    // 12i: per-station progress (ALL stations of the order) — awareness.
    // 12o: counts ticked (prepared) items as progress too.
    const stationProgress: { name: string; qty: number; ready: number }[] = (() => {
      const m = new Map<string, { name: string; qty: number; ready: number }>();
      for (const it of order.items) {
        if ((it.quantity ?? 0) <= 0) continue;
        const st = itemStation(it);
        const nm = st ? (stations.find(x => x.id === st)?.name || 'Main Kitchen') : (stationType ? null : 'Main Kitchen');
        if (!nm) continue;
        const e = m.get(nm) || { name: nm, qty: 0, ready: 0 };
        e.qty += it.quantity;
        if (isItemTicked(it)) e.ready += it.quantity;
        m.set(nm, e);
      }
      return Array.from(m.values());
    })();
    const cardCls = `relative overflow-hidden rounded-4xl border p-4 transition-colors duration-300 ${
      inReadyTab
        ? (lightMode ? 'border-emerald-500/50 bg-white shadow-card' : 'border-emerald-500/40 bg-white/[0.02] shadow-card')
        : timer.color === 'purple'
          ? (lightMode ? 'border-red-400 bg-white shadow-card' : 'border-red-500/45 bg-white/[0.02] shadow-card')
          : timer.color === 'red'
            ? (lightMode ? 'border-red-300 bg-white shadow-card' : 'border-red-500/35 bg-white/[0.02] shadow-card')
            : (lightMode ? 'border-zinc-200 bg-white shadow-card' : 'border-white/[0.08] bg-white/[0.02] shadow-card')
    }`;
    const metaRest = order.order_source !== 'dine_in'
      ? (order.customer_phone || '')
      : (order.order_number || '');
    // 12n: label = the ORDER-level workflow (SERVİSƏ HAZIRDİR etc.); but
    // when THIS station is done while other stations still cook
    // (wf='preparing'), the card still reports HAZIRDIR for its own share.
    const wfMeta = inReadyTab && wf === 'preparing'
      ? { key: 'kds_st_ready', cls: lightMode ? 'text-emerald-600' : 'text-emerald-400' }
      : wfMetaFor(wf, lightMode);
    const isExpanded = expandedId === order.id;
    return (
      <Fragment key={order.id}>
        {isExpanded ? (
          // 12m: MEASURED height (cardEls) — the exact card size, so opening
          // the modal never moves the cards behind (zero reflow).
          <div aria-hidden style={{ height: placeholderH[order.id] || undefined }} className="relative opacity-0 pointer-events-none select-none">
            <div className={`h-full w-full rounded-4xl border ${lightMode ? 'border-zinc-200' : 'border-white/[0.08]'}`} />
          </div>
        ) : (
          <motion.div
            ref={el => { cardEls.current[order.id] = el; }}
            layout
            layoutId={`kds-ticket-${order.id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : CARD_SPRING}
            whileTap={{ scale: 0.965, transition: { type: 'spring', stiffness: 400, damping: 35, mass: 0.4 } }}
            onClick={() => {
              const el = cardEls.current[order.id];
              if (el) setPlaceholderH(p => ({ ...p, [order.id]: el.offsetHeight }));
              setExpandedId(order.id);
            }}
            className={`cursor-pointer ${cardCls}`}
          >
              {/* Row 1 — title + timer (12p: the "Qəbul et" quiet pill is
                  GONE — the terminal auto-accepts pending orders silently;
                  the order shows straight as HAZIRLANIR) */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[15px] font-semibold tracking-tight truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                  {order.order_source === 'dine_in' ? `Masa ${order.table_number ?? '?'}` : order.customer_name || (order.order_source === 'takeaway' ? t('takeaway_short') : t('delivery_short'))}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                {visibleItems.length > 1 && (
                  <span className={`text-[11px] font-semibold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{visibleReady}/{visibleItems.length}</span>
                )}
                <span className={`flex items-center gap-1.5 text-[13px] font-semibold tabular-nums ${timerLate ? (lightMode ? 'text-red-500' : 'text-red-400') : (lightMode ? 'text-zinc-400' : 'text-white/35')}`}>
                  {timer.color === 'purple' && <span className={`w-1.5 h-1.5 rounded-full ${lightMode ? 'bg-red-500' : 'bg-red-400'}`} />}
                  {formatElapsedMin(timer.elapsed)}
                </span>
              </span>
            </div>
            {/* Row 2 — source chip (Apple) + phone/order no + workflow status */}
            <div className="mt-1.5 flex items-center gap-2 min-w-0">
              {(() => {
                const src = order.order_source === 'dine_in' ? t('dine_in') : order.order_source === 'takeaway' ? t('takeaway_short') : t('delivery_short');
                const SrcIcon = order.order_source === 'dine_in' ? Utensils : order.order_source === 'takeaway' ? Package : Truck;
                const cls = order.order_source === 'delivery'
                  ? (lightMode ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-blue-500/10 border-blue-500/30 text-blue-300')
                  : order.order_source === 'takeaway'
                    ? (lightMode ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-violet-500/10 border-violet-500/30 text-violet-300')
                    : (lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/[0.05] border-white/10 text-white/55');
                return (
                  <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full border text-[10px] font-bold uppercase tracking-wider shrink-0 ${cls}`}>
                    <SrcIcon size={10} strokeWidth={2.5} />
                    {src}
                  </span>
                );
              })()}
              {metaRest && <p className={`text-[11px] truncate min-w-0 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{metaRest}</p>}
              <span className={`ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider ${wfMeta.cls}`}>{t(wfMeta.key as any)}</span>
            </div>
            {/* 12i cross-station awareness (unchanged) */}
            {stationProgress.length > 1 && (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold tabular-nums">
                {stationProgress.map((g, idx) => {
                  const done = g.ready >= g.qty;
                  return (
                    <span key={g.name}>
                      {idx > 0 && <span className={lightMode ? 'text-zinc-300' : 'text-white/20'}> · </span>}
                      <span className={done ? (lightMode ? 'text-emerald-600' : 'text-emerald-400') : (lightMode ? 'text-zinc-500' : 'text-white/45')}>
                        {g.name} {g.ready}/{g.qty}
                      </span>
                    </span>
                  );
                })}
              </p>
            )}
            {/* Items — 12m spec: course chip + modifier chips (NO price) +
                "Qeyd: xxx" + allergen chips (all Apple-style, light-safe) */}
            <div className={`mt-2.5 divide-y ${lightMode ? 'divide-zinc-100' : 'divide-white/[0.05]'}`}>
              {visibleItems.map(item => {
                // 12o: circle lit = declared-ready OR ticked (preparation
                // progress). A ticked-but-not-declared item is still "work
                // in flight" for the card (dimmed, counted in progress).
                const itemTicked = isItemTicked(item);
                const itemServed = item.kitchen_status === 'served';
                const dim = itemTicked || itemServed;
                const alLabels = parseAllergens(item.allergens).map((a: any) =>
                  resolveAllergenEntry(a)?.label ||
                  (a && typeof a === 'object' ? (a.name || a.code || '') : String(a))
                ).filter(Boolean);
                return (
                  <div key={item.id} className={`flex items-center justify-between gap-2 py-2 ${dim ? 'opacity-75' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[13px] font-semibold truncate ${dim ? (lightMode ? 'text-zinc-400' : 'text-white/35') : (lightMode ? 'text-zinc-900' : 'text-white/90')}`}>
                          {item.name}
                        </span>
                        {item.is_hold && (
                          <span className={`text-[9px] font-bold tracking-wider shrink-0 ${lightMode ? 'text-amber-700' : 'text-amber-400'}`}>HOLD</span>
                        )}
                        {item.course && (
                          <span className={`inline-flex items-center h-[16px] px-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0 ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/[0.07] text-white/40'}`}>{item.course}</span>
                        )}
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.modifiers.map((m, mi) => (
                            <span key={m.id || mi} className={`inline-flex items-center h-[18px] px-1.5 rounded-md border text-[10px] font-medium ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/[0.05] border-white/10 text-white/55'}`}>
                              {m.quantity && m.quantity > 1 ? `${m.name} ×${m.quantity}` : m.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.special_notes && (
                        <p className={`mt-1 text-[11px] font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                          <span className="font-bold">{t('kds_note_label')}:</span> {item.special_notes}
                        </p>
                      )}
                      {alLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {alLabels.map((a, ai) => (
                            <span key={ai} className={`inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded-md border text-[10px] font-bold ${lightMode ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                              ⚠ {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className={`text-[13px] font-bold tabular-nums ${dim ? (lightMode ? 'text-zinc-300' : 'text-white/25') : (lightMode ? 'text-zinc-700' : 'text-white/70')}`}>×{item.quantity}</span>
                      {/* 12j POS-pattern ✓ (unchanged: persistent + bounce + pop) */}
                      <motion.button
                        onClick={(e) => { if (!itemServed) { e.stopPropagation(); handleItemToggle(order.id, item); } }}
                        title={itemServed ? undefined : (itemTicked ? t('kds_uncheck') : t('kds_tick_add'))}
                        animate={tickPulse[item.id] ? { scale: [1, 1.18, 1.04, 1] } : { scale: 1 }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                        whileTap={itemServed ? undefined : { scale: 0.86 }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center border select-none transition-all duration-200 ${
                          itemServed
                            ? (lightMode ? 'bg-emerald-600/50 border-emerald-600/50 text-white/70' : 'bg-emerald-500/40 border-emerald-400/40 text-zinc-950/70')
                            : itemTicked
                              ? (lightMode ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-500 border-emerald-500 text-zinc-950')
                              : (lightMode ? 'bg-white border-zinc-300 text-zinc-400 hover:border-emerald-500 hover:text-emerald-600' : 'bg-transparent border-white/25 text-white/45 hover:border-emerald-400 hover:text-emerald-400')
                        }`}
                      >
                        <motion.span
                          key={itemTicked || itemServed ? 'on' : 'off'}
                          initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 26 }}
                          className="text-base font-bold leading-none"
                        >✓</motion.span>
                      </motion.button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Customer note — "Qeyd: xxx" (12m: label separate) */}
            {order.customer_note && (
              <p className={`mt-2.5 text-[11px] font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                <span className="font-bold">{t('kds_note_label')}:</span> {order.customer_note}
              </p>
            )}
            {/* CTA — 12o: ready section = QUIET TEXT, not a button (owner:
                "servis posdan edilir adlı button ləğv elə olmasın orada") —
                the ticket is read-only there; SERVE is the POS floor action
                (12i), so the kitchen side shows a small emerald caption only.
                In-progress = the station-scoped "Hazırdır" main bar (12j
                persistent, no-blink). */}
            {inReadyTab ? (
              <div className="mt-3 px-0.5">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${lightMode ? 'text-emerald-700/80' : 'text-emerald-400/70'}`}>
                  <CheckCircle2 size={12} />
                  {t('kds_serving_hint')}
                </span>
              </div>
            ) : (
              (() => {
                const pendingIds = stationPendingItemIds(order, stId);
                const active = pendingIds.length > 0;
                return (
                  <button
                    onClick={(e) => { if (!active) return; e.stopPropagation(); handleMakeReady(order.id, pendingIds); }}
                    disabled={!active}
                    aria-disabled={!active}
                    className={`mt-3 w-full h-10 rounded-2xl text-[13px] font-semibold transition-all duration-300 active:scale-[0.99] ${
                      active
                        ? (lightMode ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-white text-zinc-950 hover:bg-white/90')
                        : (lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/[0.04] text-white/30')
                    }`}
                  >
                    {t('kds_ready_btn')}
                  </button>
                );
              })()
            )}
          </motion.div>
        )}
      </Fragment>
    );
  };

  // 12n — UMUMI BOARD: the active station = the navbar selection (default:
  // Main Kitchen, else the first board station). Ready-first sort: tickets
  // whose WHOLE share for this station is done sit at the TOP (emerald
  // border), then in-progress oldest-first (most delayed on top — 12e).
  const activeStation =
    boardStations.find(s => s.id === activeStationId) ||
    boardStations.find(s => s.name === 'Main Kitchen') ||
    boardStations[0] ||
    null;
  const activeTickets = activeStation
    ? stationTickets(activeStation.id).slice().sort((a, b) => {
        const ra = stationAllDone(a, activeStation.id) ? 0 : 1;
        const rb = stationAllDone(b, activeStation.id) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      })
    : [];

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
            <p className={`text-xs font-medium mt-0.5 ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{boardOrderIds.size} {t('active_orders_short')}</p>
          </div>
         <div className="flex items-center gap-2">
            {/* 12n: GÜN moved to the STATION NAVBAR for multi-station
                (/admin/kds); this quiet ghost button stays only where there
                is no navbar — the BDS single-station bar display. */}
            {boardStations.length <= 1 && (
              <button
                type="button"
                onClick={() => setDayView(v => !v)}
                className={`h-9 px-3.5 rounded-2xl text-xs font-semibold transition-all border ${dayView
                  ? (lightMode ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-950 border-white')
                  : (lightMode ? 'text-gray-500 hover:text-gray-700 bg-white border-gray-200' : 'text-white/35 hover:text-white/65 bg-white/[0.04] border-white/[0.08]')}`}
              >
                {t('kds_day_tab')}
              </button>
            )}
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

      {/* 12n (owner: "yuxarıda navbar olsun, fso hər birinə baxmaq üçün") —
          the STATION NAVBAR (Main Kitchen · Bar · GÜN; HAMISI stays removed
          per 12m). One unified board below for the selected station.
          Multi-station only: the BDS bar display (single station) keeps the
          quiet GÜN button in the header instead. */}
      {boardStations.length > 1 && (
        <nav className={`flex items-center gap-1 flex-shrink-0 px-1 pb-2.5 border-b ${lightMode ? 'border-zinc-200' : 'border-white/[0.06]'}`}>
          {boardStations.map(st => {
            const navActive = !dayView && activeStation?.id === st.id;
            const n = stationTickets(st.id).length;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => { setDayView(false); setActiveStationId(st.id); setExpandedId(null); }}
                className={`h-9 px-4 rounded-full text-[13px] font-semibold tracking-tight transition-colors ${navActive
                  ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-950')
                  : (lightMode ? 'text-zinc-500 hover:text-zinc-900' : 'text-white/50 hover:text-white/90')}`}
              >
                {st.name}
                <span className={`tabular-nums ${navActive ? (lightMode ? 'text-white/60' : 'text-zinc-400') : (lightMode ? 'text-zinc-400' : 'text-white/25')}`}> {n}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { setDayView(v => !v); setExpandedId(null); }}
            className={`h-9 px-4 rounded-full text-[13px] font-semibold tracking-tight transition-colors ${dayView
              ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-950')
              : (lightMode ? 'text-zinc-500 hover:text-zinc-900' : 'text-white/50 hover:text-white/90')}`}
          >
            {t('kds_day_tab')}
          </button>
        </nav>
      )}

      {/* Orders Grid / 12j — GÜN (All Day view + production + productivity) */}
      <div className="flex-1 overflow-y-auto py-3">
        {dayView ? (
          <div className="max-w-[1100px] mx-auto px-1">
            {dayLoading && !dayData ? (
              <div className="h-full flex items-center justify-center">
                <Clock size={22} className={`animate-pulse ${lightMode ? 'text-zinc-300' : 'text-white/20'}`} />
              </div>
            ) : !dayData ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <CheckCircle2 size={36} className="opacity-40" />
                <p className={`text-sm font-semibold ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>{t('kds_day_empty')}</p>
              </div>
            ) : (
              <>
                {/* Productivity — BIG tabular numbers + small-caps labels on a
                    hairline. No boxes (visual direction §4). */}
                <div className={`flex items-end gap-8 sm:gap-12 pb-4 border-b ${lightMode ? 'border-zinc-200' : 'border-white/[0.07]'}`}>
                  {([
                    [dayData.metrics.tickets, t('kds_day_m_orders')],
                    [dayData.metrics.items, t('kds_day_m_items')],
                    [dayData.metrics.produced, t('kds_day_m_produced')],
                    [dayData.metrics.avgAcceptMin != null ? `${dayData.metrics.avgAcceptMin}m` : '—', t('kds_day_m_accept')],
                    [dayData.metrics.avgReadyMin != null ? `${dayData.metrics.avgReadyMin}m` : '—', t('kds_day_m_ready')],
                  ] as [string | number, string][]).map(([n, label]) => (
                    <div key={label}>
                      <p className={`text-3xl font-black tabular-nums tracking-tight leading-none ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{n}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.14em] mt-1.5 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 mt-6">
                  {/* Production — per-product produced qty (Toast: production
                      item counts). served/completed only = actually cooked. */}
                  <section>
                    <h3 className={`text-[10px] font-bold uppercase tracking-[0.14em] mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('kds_day_production')}</h3>
                    {dayData.production.length === 0 ? (
                      <p className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>—</p>
                    ) : (
                      <div className={`divide-y ${lightMode ? 'divide-zinc-100' : 'divide-white/[0.05]'}`}>
                        {dayData.production.map((p: any) => (
                          <div key={p.name} className="flex items-center justify-between gap-3 py-1.5">
                            <span className={`text-[13px] font-medium truncate ${lightMode ? 'text-zinc-700' : 'text-white/70'}`}>{p.name}</span>
                            <span className={`text-[13px] font-bold tabular-nums ${lightMode ? 'text-zinc-900' : 'text-white'}`}>×{p.qty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  {/* All-day tickets (ALL of today, incl. served/closed) */}
                  <section>
                    <h3 className={`text-[10px] font-bold uppercase tracking-[0.14em] mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('kds_day_tickets')}</h3>
                    {dayData.tickets.length === 0 ? (
                      <p className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('kds_day_empty')}</p>
                    ) : (
                      <div className={`divide-y ${lightMode ? 'divide-zinc-100' : 'divide-white/[0.05]'}`}>
                        {dayData.tickets.map((tk: any) => {
                          const sc = tk.status === 'served' || tk.status === 'ready'
                            ? (lightMode ? 'text-emerald-600' : 'text-emerald-400')
                            : tk.status === 'preparing' || tk.status === 'partially'
                              ? (lightMode ? 'text-zinc-600' : 'text-white/55')
                              : (lightMode ? 'text-zinc-400' : 'text-white/30');
                          const sl = tk.status === 'served' ? t('kds_st_served')
                            : tk.status === 'ready' ? t('kds_chip_serve')
                            : tk.status === 'partially' ? t('bds_k_partially')
                            : tk.status === 'preparing' ? t('kds_st_preparing')
                            : t('kds_st_waiting');
                          return (
                            <div key={tk.id} className="flex items-center gap-3 py-2">
                              <span className={`text-xs font-semibold tabular-nums shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{tk.time}</span>
                              <span className={`text-[13px] font-semibold truncate min-w-0 ${lightMode ? 'text-zinc-800' : 'text-white/80'}`}>{tk.title}</span>
                              <span className={`text-xs font-bold tabular-nums shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>×{tk.qty}</span>
                              <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider shrink-0 ${sc}`}>{sl}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
          </div>
        ) : boardOrderIds.size === 0 ? (
          /* 2026-09-23 sweep fix: dark-mode empty state was unreadable
             (white/15 + 30% icon). Bumped to white/45 + 60% icon. */
          <div className={`flex flex-col items-center justify-center h-full ${lightMode ? 'text-gray-400' : 'text-white/45'}`}>
            <CheckCircle2 size={40} className="mb-3 opacity-60" />
            <p className="text-sm">{t('all_orders_ready')}</p>
          </div>
        ) : activeTickets.length === 0 ? (
          /* 12n: the ACTIVE station has no live tickets (others may). */
          <div className={`flex flex-col items-center justify-center h-full ${lightMode ? 'text-gray-400' : 'text-white/45'}`}>
            <Clock size={26} className="mb-2 opacity-50" />
            <p className="text-sm">{t('kds_station_empty')}</p>
          </div>
        ) : (
          /* 12n — UMUMI BOARD (owner: "mətbəxdə umumi olsun, 2 ayrı tab
             YOX, yuxarıda navbar olsun"): ONE grid for the active station —
             ready section (emerald, whole share done) first, then
             in-progress oldest-first. /admin/bds = the same single board. */
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <AnimatePresence>
              {activeTickets.map(order => renderTicket(order, activeStation!.id))}
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
          // 12i: workflow state (modal footer + header status label).
          const wf = kdsWorkflowState(o, isItemReady, nowMs);
          const wfMeta = wfMetaFor(wf, lightMode);
          const stationMap = new Map<string, { name: string; qty: number; ready: number }>();
          for (const it of items) {
            const st = itemStation(it);
            const nm = st ? (stations.find(s => s.id === st)?.name || 'Main Kitchen') : 'Main Kitchen';
            const e = stationMap.get(nm) || { name: nm, qty: 0, ready: 0 };
            e.qty += it.quantity;
            // 12i: served = done (the station's share is finished).
            if (isItemTicked(it)) e.ready += it.quantity; // 12o: ticked (prepared) counts too
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
                        {/* 12i: ORDER TYPE bold (eye-catching) — dine-in shows
                            the order number. */}
                        <span className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                          {o.order_source !== 'dine_in' ? (
                            <span className={`font-bold ${lightMode ? 'text-zinc-600' : 'text-white/65'}`}>{o.order_source === 'takeaway' ? t('takeaway_short') : t('delivery_short')}</span>
                          ) : (
                            <span>{o.order_number || ''}</span>
                          )}
                        </span>
                        {o.customer_phone && (
                          <a href={`tel:${o.customer_phone}`} className={`text-xs font-semibold tabular-nums ${lightMode ? 'text-zinc-500' : 'text-white/45'}`}>{o.customer_phone}</a>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${wfMeta.cls}`}>{t(wfMeta.key as any)}</span>
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
                        // 12o: circle lit = declared-ready OR ticked (prepared progress).
                        const itemReady = isItemTicked(item);
                        // 12m (owner): NO prices in KDS/BDS — modifier names +
                        // quantities only (the old ` · ₼X.XX` suffix is gone).
                        const modText = (item.modifiers ?? []).map(m =>
                          `${m.name}${(m.quantity && m.quantity > 1) ? ` ×${m.quantity}` : ''}`
                        ).join(', ');
                       const alLabels = parseAllergens(item.allergens).map((a: any) =>
                         resolveAllergenEntry(a)?.label ||
                         (a && typeof a === 'object' ? (a.name || a.code || '') : String(a))
                       ).filter(Boolean);
                        const itemServed = item.kitchen_status === 'served';
                        const dim = itemReady || itemServed;
                        return (
                          <div key={item.id} className={`flex items-start justify-between gap-3 py-3 first:pt-0 ${dim ? 'opacity-75' : ''}`}>
                            <div className="min-w-0 flex-1">
                               <div className="flex items-center gap-2 flex-wrap">
                                 <span className={`text-sm font-semibold ${dim ? (lightMode ? 'text-zinc-400' : 'text-white/35') : (lightMode ? 'text-zinc-900' : 'text-white/90')}`}>{item.name}</span>
                                 {item.is_hold && <span className={`text-[10px] font-bold tracking-wider ${lightMode ? 'text-amber-700' : 'text-amber-400'}`}>HOLD</span>}
                                 {/* 12m: course = Apple chip (same as the card) */}
                                 {item.course && <span className={`inline-flex items-center h-[18px] px-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/[0.07] text-white/40'}`}>{item.course}</span>}
                               </div>
                               {modText && (
                                 <div className="flex flex-wrap gap-1 mt-1">
                                   {modText.split(', ').map((mt, mi) => (
                                     <span key={mi} className={`inline-flex items-center h-[18px] px-1.5 rounded-md border text-[10px] font-medium ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/[0.05] border-white/10 text-white/55'}`}>{mt}</span>
                                   ))}
                                 </div>
                               )}
                               {item.special_notes && (
                                 <p className={`mt-1 text-xs font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                                   <span className="font-bold">{t('kds_note_label')}:</span> {item.special_notes}
                                 </p>
                               )}
                               {alLabels.length > 0 && (
                                 <div className="flex flex-wrap gap-1 mt-1">
                                   {alLabels.map((a, ai) => (
                                     <span key={ai} className={`inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded-md border text-[10px] font-bold ${lightMode ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                       ⚠ {a}
                                     </span>
                                   ))}
                                 </div>
                               )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 pt-0.5">
                              <span className={`text-sm font-bold tabular-nums ${dim ? (lightMode ? 'text-zinc-300' : 'text-white/25') : (lightMode ? 'text-zinc-700' : 'text-white/70')}`}>×{item.quantity}</span>
                               {/* 12j: POS cart-badge tick pattern (48px) —
                                   persistent control + tap bounce + glyph pop. */}
                               <motion.button
                                 onClick={() => { if (!itemServed) handleItemToggle(o.id, item); }}
                                 title={itemServed ? undefined : (itemReady ? t('kds_uncheck') : t('kds_tick_add'))}
                                 animate={tickPulse[item.id] ? { scale: [1, 1.18, 1.04, 1] } : { scale: 1 }}
                                 transition={{ duration: 0.45, ease: 'easeOut' }}
                                 whileTap={itemServed ? undefined : { scale: 0.86 }}
                                 className={`w-12 h-12 rounded-full flex items-center justify-center border select-none transition-all duration-200 ${
                                   itemServed
                                     ? (lightMode ? 'bg-emerald-600/50 border-emerald-600/50 text-white/70' : 'bg-emerald-500/40 border-emerald-400/40 text-zinc-950/70')
                                     : itemReady
                                       ? (lightMode ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-500 border-emerald-500 text-zinc-950')
                                       : (lightMode ? 'bg-white border-zinc-300 text-zinc-400 hover:border-emerald-500 hover:text-emerald-600' : 'bg-transparent border-white/25 text-white/45 hover:border-emerald-400 hover:text-emerald-400')
                                 }`}
                               >
                                 <motion.span
                                   key={itemReady || itemServed ? 'on' : 'off'}
                                   initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                                   animate={{ scale: 1, opacity: 1 }}
                                   transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 26 }}
                                   className="text-lg font-bold leading-none"
                                 >✓</motion.span>
                               </motion.button>
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
                          /* 12m: "Qeyd:" as a separate bold label (owner) */
                          <p className={`mt-2 text-[13px] font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                            <span className="font-bold">{t('kds_note_label')}:</span> {o.customer_note}
                          </p>
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

                  {/* Sticky footer — 12j: ONE PERSISTENT action surface (no
                      blink — same element, text+color morph via CSS). The
                      modal is the whole-order surface: "Hazırdır" here
                      finalizes ALL stations (intended one-tap); SERVE stays
                      the POS floor action (12i). */}
                  <div className="p-5 pt-0 flex-shrink-0">
                    {(() => {
                      let label = t('kds_ready_btn');
                      let active = true;
                      let emerald = false;
                        let act: (() => void) = () => handleMakeReady(o.id);
                        // 12p: the pending branch ("Qəbul et" modal button)
                        // is GONE — auto-accept is silent; a GÖZLƏYİR order
                        // offers the same "Hazırdır" declaration (it works
                        // from pending too).
                        if (wf === 'ready' || wf === 'serving') { label = t('kds_serving_hint'); active = false; emerald = true; }
                      else if (wf === 'served') { label = `✓ ${t('kds_served')}`; active = false; emerald = true; }
                      return (
                        <button
                          onClick={() => { if (!active) return; act(); }}
                          disabled={!active}
                          aria-disabled={!active}
                          className={`w-full h-12 rounded-2xl text-sm font-semibold transition-all duration-300 active:scale-[0.99] ${
                            emerald
                              ? (lightMode ? 'bg-emerald-600/90 text-white' : 'bg-emerald-500/85 text-zinc-950')
                              : (lightMode ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-white text-zinc-950 hover:bg-white/90')
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })()}
                  </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
     </div>
   );
 }
