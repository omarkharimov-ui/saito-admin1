'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { fastExit, slideUp, appleBackdrop, appleCard, appleViewSwap, morphView } from '@/lib/modal-transitions';
import { GridCell } from '@/lib/motion/GridCell';
import { X, Calendar, Utensils, UserCheck, Bike, Wallet, History, Clock, PanelLeftClose, PanelLeftOpen, Users, Loader2, AlertTriangle, Table2, RefreshCw, Printer, ArrowLeft, Hourglass } from '@/components/ui/saito-icons';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useDeviceHeartbeat } from '@/lib/device-heartbeat';
import WaitlistPanel, { useWaitlistCount } from './components/WaitlistPanel';
import { usePos, cartLineKey } from './hooks/usePos';
import { isFinalOrderStatus, FULFILLMENT_FINAL_STATUSES, DELIVERY_FINAL_STATUSES } from '@/lib/pos-tables';
import { useOrderStateMachine } from '@/hooks/useOrderStateMachine';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { PinGuard, type PinVerified } from './components/PinGuard';
import { ProductGrid, type ProductGridRef, SPRING, TAP } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import CustomerPhasePanel from './components/CustomerPhasePanel';
import { playHapticSound } from '@/lib/haptic';
import ReservationActionSheet from './components/ReservationActionSheet';
import TakeawayOrders from './components/TakeawayOrders';
import DeliveryOrders from './components/DeliveryOrders';
import { CashDrawerPanel } from './components/CashDrawerPanel';
import { VirtualKeyboardProvider } from './components/VirtualKeyboard';
import ClearTablePinModal from './components/ClearTablePinModal';
import TerminalTapModal from './components/TerminalTapModal';
import { OrderHistory } from './components/OrderHistory';
import { FloorSkeleton, ProductGridSkeleton, CartSkeleton } from './components/PosSkeletons';
import { LiquidDropdown } from '@/components/ui/LiquidDropdown';
import { DragTabSwitcher } from '@/components/ui/DragTabSwitcher';
import { toast } from '@/lib/toast';
import { printReceipt, getReceiptSettings, printReservation, printKitchenTicket } from '@/lib/print/PrintService';
import { usePrintClaimLoop, type PrintJob } from '@/hooks/usePrintClaimLoop';
import { apiFetch } from '@/lib/api-fetch';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import ReceiptPreview from '@/app/admin/shared/ReceiptPreview';
import type { PosProduct, LossItem } from './types/shared';

interface PosReceipt {
  tableNumber: number | string;
  orderId: string;
  items: { product_name: string; quantity: number; total_price: number }[];
  subtotal: number;
  discount: number;
  discountName?: string | null;
  tip: number;
  total: number;
  paymentMethod: string;
  cashAmount?: number;
  cardAmount?: number;
  receiptTitle?: string;
  paymentDate?: string;
  paymentTime?: string;
  staffName?: string;
  paymentMethodName?: string;
  // QF4: VAT + order type for the receipt (takeaway/delivery have no table).
  taxAmount?: number;
  taxPct?: number;
  orderType?: string | null;
}

export default function POSPage() {
  const { lightMode, setLightMode } = useTheme();
  const { t } = useLanguage();
  const pos = usePos();
  const router = useRouter();
  useDeviceHeartbeat('POS', 'pos');

  // pr v1 — terminal print claim loop: this POS tab is a "browser terminal".
  // Claims QUEUED jobs routed to browser devices (receipt / kitchen), prints
  // via the browser dialog, reports the result back. Network devices are
  // served by the LAN print agent instead.
  const printQueue = usePrintClaimLoop(true, {
    onPrint: async (job: PrintJob) => {
      const settings = await getReceiptSettings().catch(() => null);
      const p = job.payload || {};
      const paper = job.device?.paper_width || settings?.paperWidth || '80mm';
      const copies = job.device?.copies || 1;
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
      return false;
    },
  });
  const orderStateMachine = useOrderStateMachine({
    onTransition: (result) => {
      if (result.success) {
        toast.success(t('status_updated').replace('{status}', result.new_status || ''));
        setActionSheetOpen(false);
        pos.fetchData();
        if (posMode === 'takeaway') fetchTakeawayOrders();
        if (posMode === 'delivery') fetchDeliveryOrders();
      }
    },
    onError: (error) => {
      toast.error(error);
    },
  });
   
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTable, setActionSheetTable] = useState<any>(null);
  const [flashInfo, setFlashInfo] = useState<{ tableNumber: number; nonce: number } | null>(null);
  const [cashDrawerOpen, setCashDrawerOpen] = useState(false);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  // 2026-09-25 (owner: "waitlist duzelt"): dine-in queue (Növbə) panel.
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  // 2026-09-22 (owner, v2 — final design): the POS order view has two
  // PHASES sharing the big (left) area:
  //   'products'  — ProductGrid full area, cart column at MAX size (no info
  //                 anywhere — the basket is the screen)
  //   'customer'  — CustomerPhasePanel takes the GRID's place (grid not
  //                 needed while entering customer info); the cart column is
  //                 never touched (items + total stay visible).
  // Entry: the "Müşəri" chip in the cart header, or send-validation
  // (missing name/phone/address). customerFocus = focus+flash target.
  const [posPhase, setPosPhase] = useState<'products' | 'customer'>('products');
  const [customerFocus, setCustomerFocus] = useState<{ field: string; n: number } | null>(null);
  // Cart cleared (send / temizlə / back) -> always products phase.
  useEffect(() => {
    if (!pos.cart) { setPosPhase('products'); setCustomerFocus(null); }
  }, [pos.cart]);
  
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  
  const [transferMode, setTransferMode] = useState(false);
  const [transferSource, setTransferSource] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [reservationArrival, setReservationArrival] = useState<{ table_number: number; reservation_id: string | null; name: string | null; guests: number; phone?: string | null; time?: string | null; is_vip?: boolean | null; deposit_amount?: number | string | null } | null>(null);
  // 2026-09-27 (iOS-27-trash doctrine): the reservation arrival sheet must stay
  // MOUNTED while its graceful exit plays. `reservationArrival` is the LIVE
  // open-flag source (null = closed); `lastReservationArrival` retains the
  // data until the next arrival overwrites it — the sheet renders from it and
  // animates closed instead of vanishing in one frame.
  const [lastReservationArrival, setLastReservationArrival] = useState<typeof reservationArrival>(null);
  useEffect(() => { if (reservationArrival) setLastReservationArrival(reservationArrival); }, [reservationArrival]);

  const [unmergeMode, setUnmergeMode] = useState(false);
  const [selectedForUnmerge, setSelectedForUnmerge] = useState<number[]>([]);

  // U-4: guard against silently discarding an unsent cart when the panel is
  // closed (back).
  const [unsentCartGuard, setUnsentCartGuard] = useState(false);

  const [lastUndo, setLastUndo] = useState<any>(null);
  const [cleanMode, setCleanMode] = useState(false);
  const [paymentView, setPaymentView] = useState(false);
  const [receiptView, setReceiptView] = useState<PosReceipt | null>(null);
  const [receiptTendered, setReceiptTendered] = useState<number | undefined>(undefined);
  // 2026-09-26 (Q8 offline phase 2): receipt flag when payment was captured
  // locally (offline) instead of applied server-side.
  const [payOfflinePending, setPayOfflinePending] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountBusy, setDiscountBusy] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  // Sprint-1: manager PIN override for >20% discounts.
  const [discountPinOpen, setDiscountPinOpen] = useState(false);
  const [payOutcome, setPayOutcome] = useState<{ okCount: number; failed: any[]; method: string } | null>(null);
  const payKeyRef = useRef<Record<string, string>>({});
  const payKeyFor = useCallback((orderId: string) => {
    if (!payKeyRef.current[orderId]) {
      payKeyRef.current[orderId] = `pos:${orderId}:${crypto.randomUUID()}`;
    }
    return payKeyRef.current[orderId];
  }, []);
  const [courierPickerOpen, setCourierPickerOpen] = useState(false);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [couriersLoading, setCouriersLoading] = useState(false);
  const [courierStatusOpen, setCourierStatusOpen] = useState(false);
  const [courierStatusTransitions, setCourierStatusTransitions] = useState<{ to_status: string; description: string | null }[]>([]);
  const [courierStatusLoading, setCourierStatusLoading] = useState(false);
  const pickedUpTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const posMode = pos.posMode;
  // 2026-09-25 (owner: "toggle olsun ayarlarda"): waitlist master switch from
  // Settings → General (fail-open: read error = enabled, same as delivery gates).
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  // 2026-09-27 (owner: "vat ayarlardan bağlıdırsa niyə göstərir"): the VAT
  // line in the cart now follows the global EDV switch (Settings → Payment).
  const [vatEnabled, setVatEnabled] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch('/api/settings/general');
        if (!res.ok || !active) return;
        const j = await res.json();
        const v = j?.settings?.waitlist_enabled;
        if (typeof v === 'boolean') setWaitlistEnabled(v);
        const vat = j?.settings?.auto_apply_vat;
        if (typeof vat === 'boolean') setVatEnabled(vat);
      } catch { /* fail-open */ }
    })();
    return () => { active = false; }
  }, []);
  const waitlistCount = useWaitlistCount(posMode === 'dine_in' && waitlistEnabled);
  const setPosMode = pos.setPosMode;
  /* ═══ 2026-09-27 (owner: "mərtəbə çipi aktiv tab pill-ə uçub onunla
     birləşsin — WhatsApp-style") ═══
     Deterministic manual shared-element flight. (First try used a framer
     layoutId projection — E2E proved it fires ONE direction only: the
     chip→pill fly worked, pill→chip did not, because the handoff source had
     finished at opacity 0. So the flight is now measured + animated by
     hand: a chip-styled fixed-position ghost animates box→point (OUT) or
     point→box (IN) over 260/340ms [0.45,0,0.55,1] (zero overshoot); the
     real chip dims over 150ms so there is never a double image.) */
  type FloorMorphRect = { x: number; y: number; w: number; h: number };
  const tabGroupRef = useRef<HTMLDivElement>(null);
  const chipWrapRef = useRef<HTMLDivElement>(null);
  const chipRectRef = useRef<FloorMorphRect | null>(null);
  const [morphGhost, setMorphGhost] = useState<{ id: number; dir: 'out' | 'in'; from: FloorMorphRect; to: FloorMorphRect } | null>(null);
  const [chipDimmed, setChipDimmed] = useState(false);

  // Keep the chip's last known box fresh (window resize / floor count change).
  useLayoutEffect(() => {
    if (posMode === 'dine_in' && chipWrapRef.current) {
      const r = chipWrapRef.current.getBoundingClientRect();
      chipRectRef.current = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
  }, [posMode, pos.floors.length, lightMode]);

  // Safety: the chip must never be left invisible if a flight is lost.
  useEffect(() => {
    if (posMode === 'dine_in' && chipDimmed) {
      const t = setTimeout(() => setChipDimmed(false), 600);
      return () => clearTimeout(t);
    }
  }, [posMode, chipDimmed]);

  // Called by DragTabSwitcher the moment a tab switch STARTS (before the
  // pill travel) — the only point where both the chip (OUT) / the current
  // pill rest position (IN) and the target tab are measurable.
  const handleTabMorph = useCallback((next: string) => {
    if (pos.floors.length < 2) return; // single floor → no chip → no morph
    const container = tabGroupRef.current;
    if (!container) return;
    const btns = Array.from(container.querySelectorAll('button'));
    const idx = (id: string) => ['dine_in', 'takeaway', 'delivery'].indexOf(id);
    const pointAt = (r: DOMRect): FloorMorphRect => ({ x: r.left + r.width / 2 - 4, y: r.top + r.height / 2 - 4, w: 8, h: 8 });
    if (next !== 'dine_in') {
      const chipRect = chipRectRef.current;
      const target = btns[idx(next)];
      if (!chipRect || !target) return;
      setMorphGhost({ id: Date.now(), dir: 'out', from: { x: chipRect.x, y: chipRect.y, w: chipRect.w, h: chipRect.h }, to: pointAt(target.getBoundingClientRect()) });
      setChipDimmed(true); // chip fades 150ms while the ghost flies from its box
    } else {
      const from = btns[idx(pos.posMode)];
      const chipRect = chipRectRef.current;
      if (!from || !chipRect) return;
      setMorphGhost({ id: Date.now(), dir: 'in', from: pointAt(from.getBoundingClientRect()), to: { x: chipRect.x, y: chipRect.y, w: chipRect.w, h: chipRect.h } });
      setChipDimmed(true); // the incoming chip mounts dimmed; fades in on ghost landing
    }
  }, [pos.floors.length, pos.posMode]);

  const [posRole, setPosRole] = useState<string | null>(null);
  const posRoleNorm = posRole?.toLowerCase() || '';
  const isCashierOrAdmin = ['cashier', 'superadmin'].includes(posRoleNorm);
  const isManagerOrAbove = ['cashier', 'superadmin'].includes(posRoleNorm);
  const [posSession, setPosSession] = useState<{ staffId: string; name: string; role: string; shift?: string } | null>(null);
  const [activeStaff, setActiveStaff] = useState<any[]>([]);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gridRef = useRef<ProductGridRef>(null);
  // Table tap → order: 150ms selection pulse before navigation.
  const [tableTapPulse, setTableTapPulse] = useState<{ tableNumber: number; nonce: number } | null>(null);
  const tableTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // QF3: MASANI BOŞALT is gated by a verified manager PIN (destructive op).
  // mode 'dismiss' = occupied table (cancels the order via dismiss_table_atomic);
  // mode 'clear'   = empty/dirty table (clear_table_atomic);
  // mode 'group'   = merged group (unmerge children, then dismiss each).
  const [clearPinTable, setClearPinTable] = useState<{ num: number; mode: 'clear' | 'dismiss' | 'group'; children?: number[] } | null>(null);
  // QF5 + Delivery Phase 1 (2026-09-24): delivery zones (public data, RLS
  // off) — zone picker + auto fee. New: km range / min order / priority /
  // ETA range columns, sorted by priority ASC; the whole list is hidden when
  // settings.delivery_enabled = false (master switch; fail-open if the
  // client's role can't read settings — the feature is on by default).
  const [deliveryZones, setDeliveryZones] = useState<{
    id: string; name: string; fee: number; free_delivery_threshold: number;
    estimated_minutes: number; min_km: number | null; max_km: number | null;
    min_order: number | null; priority: number;
    est_minutes_min: number | null; est_minutes_max: number | null;
  }[]>([]);
  // Delivery Phase 2 (2026-09-24): live settings gates (master switch,
  // accepting pause, global min order). Fail-open: a read failure (e.g. the
  // browser role lacks settings RLS) means "enabled + accepting + no min".
  const [deliveryGates, setDeliveryGates] = useState<{ enabled: boolean; accepting: boolean; minOrder: number | null }>({
    enabled: true, accepting: true, minOrder: null,
  });
  // Delivery Phase 2 (E2E fix): the browser session is anon, and `settings`
  // has RLS — a direct Supabase read 401s (caught in the Phase 2 E2E: the
  // pause banner never rendered). The gates come from the authenticated
  // staff endpoint instead. Fail-open: read failure = enabled + accepting.
  const applyDeliveryGates = (g: any) => {
    setDeliveryGates({
      enabled: g ? g.enabled !== false : true,
      accepting: g ? g.accepting !== false : true,
      minOrder: g?.minOrder != null ? Number(g.minOrder) : null,
    });
    return g ? g.enabled !== false : true;
  };
  const refreshDeliveryGates = useCallback(async () => {
    try {
      const res = await apiFetch('/api/pos/delivery-status');
      applyDeliveryGates(res.ok ? await res.json() : null);
    } catch { /* fail-open */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [zonesRes, gatesRes] = await Promise.all([
          supabase
            .from('delivery_zones')
            .select('id, name, fee, free_delivery_threshold, estimated_minutes, min_km, max_km, min_order, priority, est_minutes_min, est_minutes_max')
            .eq('is_active', true)
            .order('priority', { ascending: true })
            .order('name', { ascending: true }),
          (async () => {
            const r = await apiFetch('/api/pos/delivery-status');
            return r.ok ? r.json() : null;
          })(),
        ]);
        if (cancelled) return;
        const enabled = applyDeliveryGates(gatesRes);
        setDeliveryZones(enabled ? ((zonesRes.data || []) as any) : []);
      } catch { /* non-blocking: manual fee stays available */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Re-check the gates when the cashier opens the customer phase — the pause
  // may have been flipped in BDS/Settings while the cart was being built.
  useEffect(() => {
    if (posPhase === 'customer' && posMode === 'delivery') void refreshDeliveryGates();
  }, [posPhase, posMode, refreshDeliveryGates]);
  // Son / Məşur tab data (was hardcoded UI only — tabs never filtered).
  const [filterData, setFilterData] = useState<{ recent: { id: string; name: string }[]; popular: { id: string; name: string; qty: number }[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/pos/filter-data')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setFilterData(d); })
      .catch(() => { /* non-blocking */ });
    return () => { cancelled = true; };
  }, []);

  const [takeawayOrders, setTakeawayOrders] = useState<any[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<any[]>([]);

  // 2026-09-27 (owner: "stokda olmayan məhsul kartlarının yanıb-sönməsi bug
  // kimi görünür"): STABLE PROP IDENTITIES for ProductGrid. The old inline
  // Set / reduce object was rebuilt on EVERY page render (the 3s floor poll),
  // invalidating the grid's `filtered` memo and re-running the full card list
  // — the OOS cards visibly flickered as a result. Both now change only when
  // their source data actually changes (catalog reload / cart mutation).
  const outOfStockSet = useMemo(
    () => new Set((pos.products ?? []).filter((p: any) => p.is_in_stock === false || p.is_available === false).map((p: any) => p.id)),
    [pos.products],
  );
  const posCartCounts = useMemo(
    () => (pos.cart?.items ?? []).reduce((acc: Record<string, number>, item: any) => {
      const id = item.product_id;
      acc[id] = (acc[id] || 0) + (item.quantity || 0);
      return acc;
    }, {}),
    [pos.cart],
  );

  // NOTE (M2 removed): a `checkoutTotal` useMemo lived here with a hardcoded
  // 18% tax-INCLUSIVE VAT formula — it diverged from the server SSOT
  // (calculate_order_total_v3, tax-EXCLUSIVE) and was unused (dead landmine).
  // Totals always come from the server: table.total_amount / order.total_amount.

  useEffect(() => {
    if (!flashInfo) return;
    const t = setTimeout(() => setFlashInfo(null), 2600);
    return () => clearTimeout(t);
  }, [flashInfo]);

  useEffect(() => {
    setFlashInfo(null);
    // 2026-09-26 (Task 55, audit55 P0 leak): the waitlist overlay + its VKB
    // used to survive a posMode switch (e.g. dine-in → TAKEAWAY) and block the
    // whole screen until manually closed. Mode switch = any open sheet/panel
    // resets.
    setWaitlistOpen(false);
    setActionSheetOpen(false);
    // 2026-09-26 (Task 55): a stale smart-surge badge (rain/peak) from a
    // previous delivery cart must not follow into dine-in or takeaway.
    setDeliverySurge(null);
  }, [posMode]);

  // 2026-09-26 (Task 53 P1-6 ready-notify — Toast "food ready → ping server"):
  // when a table's aggregated kitchen_status transitions in-progress
  // (pending/accepted/sent/preparing) → ready/completed, chime + toast + flash
  // the table card so the floor server runs the food. Driven by the same
  // `pos.floors` state that pos-sync realtime + 3s poll keep fresh — no extra
  // poll. First load never pings (prev map empty).
  const prevKitchenStatusRef = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    const prev = prevKitchenStatusRef.current;
    // 2026-09-26 (Task 54 verify fix): 'partially_ready' MUST be in the
    // in-progress set — a 2-item order goes preparing → partially_ready →
    // ready, and the ping fires on the final transition.
    const inProgress = new Set(['pending', 'accepted', 'sent', 'preparing', 'hold', 'partially_ready']);
    const readySet = new Set(['ready', 'completed']);
    (pos.floors || []).forEach((f: any) => {
      (f.tables || []).forEach((tb: any) => {
        const num = tb.table_number;
        const cur = (tb.kitchen_status || null) as string | null;
        const was = prev.get(num);
        if (cur && readySet.has(cur) && was && inProgress.has(was)) {
          playHapticSound('success');
          toast(`Masa ${num} — ${t('kitchen_ready_notify')}`, { id: `ready-${num}`, duration: 5000 });
          setFlashInfo({ tableNumber: num, nonce: Date.now() });
        }
        if (cur) prev.set(num, cur);
        else if (was !== undefined) prev.delete(num); // table emptied — forget
      });
    });
  }, [pos.floors, t]);

  // 2026-09-22 (payment ↔ fulfillment separation): the active lists must keep
  // PAID orders visible (they still need handover/delivery) and only drop
  // FULFILLMENT-final ones. The old FINAL_ORDER_STATUSES included 'paid', so a
  // paid takeaway order vanished from the list the moment it was paid —
  // before it could be handed over.
  const fetchTakeawayOrders = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/orders?order_source=takeaway&status=not.in.(${FULFILLMENT_FINAL_STATUSES.join(',')})`);
      if (res.ok) {
        const data = await res.json();
        setTakeawayOrders(data.orders || []);
      } else {
        toast.error(t('takeaway_orders_load_error'));
      }
    } catch (e) {
      console.error('Failed to fetch takeaway orders:', e);
      toast.error(t('takeaway_orders_load_error'));
    }
  }, []);

  const fetchDeliveryOrders = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/orders?order_source=delivery&status=not.in.(${FULFILLMENT_FINAL_STATUSES.join(',')})`);
      if (res.ok) {
        const data = await res.json();
        // Delivery completion is tracked in delivery_status (not orders.status),
        // so drop delivered/completed/cancelled here (client-side).
        const active = (data.orders || []).filter((o: any) =>
          !o.delivery_status || !(DELIVERY_FINAL_STATUSES as readonly string[]).includes(o.delivery_status));
        setDeliveryOrders(active);
      } else {
        toast.error(t('delivery_orders_load_error'));
      }
    } catch (e) {
      console.error('Failed to fetch delivery orders:', e);
      toast.error(t('delivery_orders_load_error'));
    }
  }, []);

  useEffect(() => {
    if (posMode === 'takeaway') fetchTakeawayOrders();
    if (posMode === 'delivery') fetchDeliveryOrders();
  }, [posMode, fetchTakeawayOrders, fetchDeliveryOrders]);

  // P2 — TA/Delivery order-list fallback poll (15s). Mounted ONLY outside
  // dine_in: dine-in orders are covered by S1 pos-sync (inside usePos), so
  // dine-in must not spin an extra order-list poll. The effect cleanup tears
  // the interval down on mode switch (dine_in ⇄ takeaway ⇄ delivery).
  useEffect(() => {
    if (actionSheetOpen || paymentView) return;
    if (posMode === 'dine_in') return;
    const poll = setInterval(() => {
      if (posMode === 'takeaway') fetchTakeawayOrders();
      if (posMode === 'delivery') fetchDeliveryOrders();
    }, 15000);
    // 2026-09-26 (Task 53 P0-2 realtime): TA/Delivery order list was poll-only
    // (15s) — a new delivery order could sit invisible up to 15s. Now
    // orders/order_items row changes push a debounced (1.5s) refetch; the 15s
    // poll stays as the safety fallback (pos-sync covers dine-in floor only).
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onRowChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (posMode === 'takeaway') fetchTakeawayOrders();
        if (posMode === 'delivery') fetchDeliveryOrders();
      }, 1500);
    };
    const channel = createRealtimeChannel('pos-tad-list')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'orders' }, onRowChange)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'order_items' }, onRowChange)
      .subscribe();
    return () => {
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      removeRealtimeChannel(channel);
    };
  }, [posMode, fetchTakeawayOrders, fetchDeliveryOrders, actionSheetOpen, paymentView]);

  useEffect(() => {
    let cancelled = false;
    const prefetch = async () => {
      try {
        const [tablesRes, productsRes] = await Promise.all([
          fetch('/api/pos/tables', { cache: 'force-cache' }),
          fetch('/api/pos/products', { cache: 'force-cache' }),
        ]);
        if (!cancelled) {
          if (tablesRes.ok) await tablesRes.json();
          if (productsRes.ok) await productsRes.json();
        }
      } catch {}
    };
    prefetch();
    return () => { cancelled = true; };
  }, []);

  // S2 — TA/Delivery order-list realtime. Subscribed ONLY when posMode is
  // takeaway/delivery: dine-in relies on S1 pos-sync (orders → floor refresh
  // inside usePos), so dine-in must not open this extra orders channel. When
  // switching modes the previous channel is removed by the cleanup before the
  // new mode mounts its own mechanism — no leaked subscriptions/timers.
  useEffect(() => {
    if (posMode === 'dine_in') return;
    const channel = supabase
      .channel('pos-order-list-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (posMode === 'takeaway') fetchTakeawayOrders();
        if (posMode === 'delivery') fetchDeliveryOrders();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [posMode, fetchTakeawayOrders, fetchDeliveryOrders]);

  // 2026-09-27 (owner: "stokda yoxdur real işləyirmi"): LIVE catalog —
  // the DB 86-cycle (auto 86 on depletion / auto-reactivate on restock)
  // updates products.is_in_stock; this channel pushes it to the grid
  // within seconds (throttled 10s) instead of waiting for a manual refresh.
  useEffect(() => {
    let lastRefetch = 0;
    const channel = supabase
      .channel('pos-products-availability')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: 'is_in_stock=not.is.null' }, () => {
        const now = Date.now();
        if (now - lastRefetch < 10_000) return;
        lastRefetch = now;
        pos.fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pos.fetchData]);

  useEffect(() => {
    // 1) Try localStorage first (instant)
    const saved = localStorage.getItem('pos_session');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setPosSession(s);
        setPosRole(s.role);
      } catch { localStorage.removeItem('pos_session'); }
    }
    // 2) Development bypass — skip auth in dev mode (only if no saved session)
    if (!saved && process.env.NODE_ENV === 'development') {
      const devSession = { staffId: 'dev-001', name: 'DEV User', role: 'superadmin' };
      setPosSession(devSession);
      setPosRole('admin');
      localStorage.setItem('pos_session', JSON.stringify(devSession));
    }
    // 3) 2026-09-26 (Task 54 verify fix, P0 "no payment UI"): ALWAYS re-sync
    //    the role from the LIVE session cookie — localStorage is only the
    //    instant-paint cache. A STALE pos_session (previous cashier logged
    //    out / role changed server-side) used to silently hide every
    //    cashier+ action (ÖDƏNİŞ/void/discount) with zero feedback because
    //    isCashierOrAbove=false. Live session = SSOT.
    (async () => {
      try {
        const res = await fetch('/api/pos/session', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.role) {
            setPosSession(data);
            setPosRole(data.role);
            try { localStorage.setItem('pos_session', JSON.stringify(data)); } catch { /* private mode */ }
          }
          return;
        }
        // No valid session:
        if (!saved && process.env.NODE_ENV !== 'development') {
          window.location.href = '/staff/login?returnTo=/admin/pos';
        }
        // Saved session but cookie gone: keep the local role for now — the
        // next authed API call fires pos:unauthorized → canonical redirect.
      } catch {
        if (!saved && process.env.NODE_ENV !== 'development') {
          window.location.href = '/staff/login?returnTo=/admin/pos';
        }
      }
    })();
  }, []);

  // Fetch active staff and clock status
  useEffect(() => {
    if (!posSession) return;

    const fetchActiveStaff = async () => {
      try {
        const res = await fetch('/api/pos/staff');
        if (res.ok) {
          const data = await res.json();
          setActiveStaff(data.activeStaff || []);
          setIsClockedIn(data.activeStaff.some((s: any) => s.id === posSession.staffId));
        }
      } catch {}
    };

    fetchActiveStaff();
    const interval = setInterval(fetchActiveStaff, 30000);
    return () => clearInterval(interval);
  }, [posSession]);

  // 2026-09-24 (owner "bizde error ekranlarımız yoxdurmu"): wired to the
  // CashDrawerPanel OPEN_SHIFT_REQUIRED dialog (one-click clock-in). No
  // permanent header button — that was removed by owner request on 09-21.
  const handleClockIn = async (): Promise<boolean> => {
    try {
      const csrf = typeof document !== 'undefined' ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] || '' : '';
      const res = await fetch('/api/pos/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        // 2026-09-24 (E2E round-2 catch): role_id must NOT be sent. posSession.role
        // is a role NAME string ('superadmin'), but the route compares it to the
        // staff's role_id UUID → 400 INVALID_ROLE after the shift was already
        // created (clock-in silently "failed"). Single-role model (D-19): the
        // route's active_role_id patch is dead weight — omitting role_id skips it.
        body: JSON.stringify({ action: 'in' }),
      });
      if (res.ok) {
        setIsClockedIn(true);
        const staffRes = await fetch('/api/pos/staff');
        if (staffRes.ok) {
          const data = await staffRes.json();
          setActiveStaff(data.activeStaff || []);
        }
        return true;
      }
    } catch {}
    return false;
  };

  const handleClockOut = async () => {
    setShiftReviewOpen(true);
  };

  const confirmClockOut = async () => {
    try {
      const csrf = typeof document !== 'undefined' ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] || '' : '';
      const res = await fetch('/api/pos/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ action: 'out' }),
      });
      if (res.ok) {
        setIsClockedIn(false);
        setShiftReviewOpen(false);
        setShiftReviewData(null);
        const staffRes = await fetch('/api/pos/staff');
        if (staffRes.ok) {
          const data = await staffRes.json();
          setActiveStaff(data.activeStaff || []);
        }
      }
    } catch {}
  };

  useEffect(() => {
    const onUnauthorized = async () => {
      if (!posSession) return;
      // 2026-09-27 (owner: "kassa öz-özünə bağlanır"): ONE last-chance
      // keepalive before the hard redirect — a transient cookie slip or
      // clock skew should not bounce a cashier (and drop the Kassa modal).
      try {
        const keep = await fetch('/api/auth/keepalive', { method: 'POST' });
        if (keep.ok) return; // session is fine — do NOT logout/redirect
      } catch { /* fall through to the canonical redirect */ }
      setPosSession(null);
      setPosRole(null);
      localStorage.removeItem('pos_session');
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {}
      window.location.href = '/staff/login?returnTo=/admin/pos';
    };
    window.addEventListener('pos:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pos:unauthorized', onUnauthorized);
  }, [posSession]);

  // 2026-09-27: session keepalive — sliding 12h window while the POS tab is
  // actively visible (a working shift never expires mid-session).
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try { await fetch('/api/auth/keepalive', { method: 'POST' }); } catch {}
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Pre-fetch takeaway & delivery orders on mount so they're instant when switching tabs
  useEffect(() => {
    fetchTakeawayOrders();
    fetchDeliveryOrders();
  }, [fetchTakeawayOrders, fetchDeliveryOrders]);

  // POS-header X logout removed by owner (2026-09-22): single logout path is
  // the sidebar / nav-dock logout. Unauthorized events still auto-redirect
  // via the pos:unauthorized listener above.

   // Reservation → pre-order handoff: the reservations page navigates here with
   // ?resId=&tableIds=&guestName= and also writes a localStorage context. When
   // present we enter reservation mode: auto-select the target table, link the
   // cart/order to the reservation, and show a "Bron Et" (Reserve) action.
   const searchParams = useSearchParams();
   const [reservationMode, setReservationMode] = useState(false);
   const [reservationId, setReservationId] = useState<string | null>(null);
   const [reservationGuest, setReservationGuest] = useState<string | null>(null);
   // One-shot guard: the pre-order handoff from the reservations page must run
   // exactly once — not re-fire on every floor refresh (which would re-open the
   // reserved table and re-enable reservation mode on normal tables).
   const preorderHandoffConsumed = useRef(false);

   useEffect(() => {
     if (posMode === 'dine_in') return;
     setSelectedFloor(null);
     setReservationMode(false);
     setReservationId(null);
     setReservationGuest(null);
   }, [posMode]);

  useEffect(() => {
    if (preorderHandoffConsumed.current) return;
    const resId = searchParams.get('resId') || searchParams.get('reservation_id');
    const tableIds = (searchParams.get('tableIds') || '').split(',').filter(Boolean);
    const guestName = searchParams.get('guestName') || '';
    let ctx: any = null;
    try { ctx = JSON.parse(localStorage.getItem('saito_pos_preorder_context') || 'null'); } catch { ctx = null; }
    // Consume the localStorage handoff exactly once so a stale context from a
    // previous "Öncədən Sifariş" click can't auto-open a table on every later
    // POS visit.
    if (ctx) localStorage.removeItem('saito_pos_preorder_context');

    const finalResId = resId || ctx?.resId;
    const finalTableIds = tableIds.length ? tableIds : (ctx?.tableIds || []);
    const finalGuest = guestName || ctx?.guestName || '';

    if (!finalResId || finalTableIds.length === 0) return;

    preorderHandoffConsumed.current = true;
    setReservationMode(true);
    setReservationId(finalResId);
    setReservationGuest(finalGuest || null);

    // Auto-select the first target table once table data is loaded.
    const trySelect = () => {
      const allTables = (pos.floors || []).flatMap((f: any) => f.tables || []);
      const target = allTables.find((t: any) => finalTableIds.includes(t.id));
      if (target) {
        pos.selectTable(target, { allowReserved: true });
        return true;
      }
      return false;
    };
    if (!trySelect()) {
      const id = setInterval(() => { if (trySelect()) clearInterval(id); }, 300);
      return () => clearInterval(id);
    }
  }, [searchParams, pos.floors]);

  // Stamp the active cart with the reservation link so placeOrder forwards it.
  useEffect(() => {
    if (!reservationMode || !reservationId) return;
    if (pos.cart && pos.cart.table_number && pos.cart.reservation_id !== reservationId) {
      pos.setCart({ ...pos.cart, reservation_id: reservationId, customer_name: pos.cart.customer_name || reservationGuest || undefined });
    }
  }, [reservationMode, reservationId, reservationGuest, pos.cart, pos.setCart]);

  // Bill request notification — səs + popup
  const [billNotify, setBillNotify] = useState<{ table: number; time: number } | null>(null);
  const [shiftReviewOpen, setShiftReviewOpen] = useState(false);
  const [shiftReviewData, setShiftReviewData] = useState<any>(null);
  const prevBillRequested = useMemo(() => {
    const allTables = (pos.floors || []).flatMap((f: any) => f.tables || []);
    return allTables.filter((t: any) => t.bill_requested).map((t: any) => t.table_number).join(',');
  }, [pos.floors]);

  useEffect(() => {
    if (!prevBillRequested) return;
    const nums = prevBillRequested.split(',').map(Number).filter(Boolean);
    if (nums.length === 0) return;
    const latest = nums[nums.length - 1];
    setBillNotify({ table: latest, time: Date.now() });
      // Play notification sound — reuse single AudioContext
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = 0.15;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
        setTimeout(() => { try { const o2 = ctx.createOscillator(); const g2 = ctx.createGain(); o2.connect(g2); g2.connect(ctx.destination); o2.frequency.value = 1100; o2.type = 'sine'; g2.gain.value = 0.15; o2.start(); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); o2.stop(ctx.currentTime + 0.3); } catch {} }, 350);
      } catch { /* silent */ }
  }, [prevBillRequested]);

  useEffect(() => {
    return () => { try { audioCtxRef.current?.close(); } catch {} };
  }, []);

  const cleanModeRef = useRef(cleanMode);
  useEffect(() => { cleanModeRef.current = cleanMode; }, [cleanMode]);
  useEffect(() => {
    return () => {
      if (cleanModeRef.current && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const handleRecordLoss = async (items: LossItem[], reason: string) => {
    const res = await apiFetch('/api/stock/loss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, reason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Loss recording failed');
    }
  };

  const handleProductTap = (product: PosProduct) => {
    const p = product as any;
    if (p.__expanded) {
      // Tək çağırış — quantity opts ilə. Dövr ilə çağırmaq olmaz: cartRef
      // yalnız re-render-dan sonra sync olur, loop stale cart oxuyur.
      const preItems = (pos.cart?.items || []) as any[];
      const origLine = p.__editOf?.lineIndex != null ? preItems[p.__editOf.lineIndex] : undefined;
       pos.addToCart(product, {
         variantId: p.variant_id ?? null,
         notes: p.special_notes || undefined,
         modifiers: p.__modifiers || [],
         quantity: Math.max(1, Number(p.__qty) || 1),
         editOf: p.__editOf || undefined,
         course: p.__course !== undefined ? p.__course : undefined,
         isHold: p.__is_hold !== undefined ? p.__is_hold : undefined,
         allergens: p.__allergens || [],
       });
      // Smart-edit sync (owner fix 2026-09-21): when the edited line is a
      // SERVER line (already sent), push the new config to the DB — otherwise
      // course/modifier edits only lived in the local cart and were lost on
      // the next refetch ("course dəyişmir").
      if (origLine?.id && p.__editOf) {
        void (async () => {
          try {
            await apiFetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'updateItem',
                id: (pos.cart as any)?.order_id || origLine.order_id,
                data: {
                  order_item_id: origLine.id,
                  course: p.__course !== undefined ? p.__course : origLine.course,
                  modifiers: p.__modifiers || origLine.modifiers || [],
                  special_notes: p.special_notes !== undefined ? p.special_notes : (origLine.special_notes || ''),
                  variant_id: p.variant_id !== undefined ? p.variant_id : origLine.variant_id,
                  unit_price: p.__newUnitPrice,
                  // A sent line can't shrink below what was already sent.
                  quantity: Math.max(1, Number(p.__qty) || 1, Number(origLine.sentQuantity ?? origLine.quantity ?? 0)),
                  allergens: Array.isArray(p.__allergens) ? p.__allergens : undefined,
                },
              }),
            });
          } catch { /* non-fatal: local cart already updated */ }
        })();
      }
      return;
    }
    // Kart toxunuşu = BİRBAŞA səbətə. Variantlı məhsulda default variant
    // seçilir; konfiqurasiya (variant dəyişmə, modifikator, qeyd) səbətdəki
    // sətirin details düyməsindən redaktə olunur.
    const variants = pos.variantsByProduct[product.id] || [];
    const def = variants.find((v: any) => v.is_default) || variants[0];
    pos.addToCart(product, { variantId: def?.id ?? null });
  };

  const handleOpenPayment = () => setPaymentView(true);
  const handleBackFromPayment = () => setPaymentView(false);

  const handlePrintBill = async () => {
    if (!actionSheetTable) return;
    try {
      const tableNumbers = [actionSheetTable.table_number];
      const ordersRes = await apiFetch('/api/orders');
      if (!ordersRes.ok) return;
      const ordersData = await ordersRes.json();
      const activeOrders = (ordersData.orders || []).filter((o: any) =>
        !isFinalOrderStatus(o.status) && tableNumbers.includes(o.table_number)
      );
      if (activeOrders.length === 0) { toast.error(t('order_not_found')); return; }
       const settings = await getReceiptSettings();
       let routedCount = 0;
       let directCount = 0;
       for (const order of activeOrders) {
         const items = (order.order_items || []).map((item: any) => ({
           name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
           quantity: item.quantity || 1,
           price: Number(item.total_price || item.price || 0),
         }));
         const payload = {
           restaurantName: settings.restaurantName,
           address: settings.address,
           receiptTitle: 'HESAB',
           currency: settings.receiptCurrency,
           serviceFeePct: settings.serviceFeePct,
           showServiceFee: settings.showServiceFee,
           footerText: settings.footerText,
           tableNumber: order.table_number,
           orderId: order.id,
           items,
           subtotal: Number(order.total_amount) || 0,
           discount: Number(order.discount_amount) || 0,
           discountName: order.campaigns?.name,
           tip: 0,
           total: Number(order.total_amount) || 0,
           paymentMethod: '',
           cashAmount: 0,
           cardAmount: 0,
           date: new Date().toISOString(),
           time: new Date().toISOString(),
           paperWidth: settings.paperWidth,
           copies: 1,
         };
         // pr v1: server-routed print first (device registry); fall back to
         // the legacy direct browser print when no receipt device is routed.
         try {
           const enqRes = await apiFetch('/api/print/enqueue', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               doc_type: 'receipt',
               order_id: order.id,
               trigger_key: `bill:${order.id}:${Date.now()}`,
               payload,
             }),
           });
           const enq = await enqRes.json().catch(() => ({}));
           if (enqRes.ok && enq.routed === true) { routedCount++; continue; }
         } catch { /* fall through to direct print */ }
         await printReceipt(payload);
         directCount++;
       }
       if (routedCount > 0) toast.success(`Çek növbəsinə qoyuldu (${routedCount})`);
       if (directCount > 0) toast.success(t('bill_printed'));
    } catch {
      toast.error(t('print_error'));
    }
  };

  const handleOpenOrderSheet = (order: any) => {
    setActionSheetTable({
      ...order,
      table_number: order.order_number || order.id,
    });
    setActionSheetOpen(true);
  };


  const handleOpenCourierPicker = async () => {
    setCourierPickerOpen(true);
    setCouriersLoading(true);
    try {
      const res = await apiFetch('/api/couriers?active=true');
      if (res.ok) {
        const data = await res.json();
        setCouriers(data.couriers || []);
      }
    } catch {
      toast.error(t('error_occurred'));
    } finally {
      setCouriersLoading(false);
    }
  };

  const handleOpenCourierStatus = async () => {
    if (!actionSheetTable) return;
    setCourierStatusOpen(true); setCourierStatusLoading(true);
    try {
      const current = actionSheetTable.delivery_status || 'confirmed';
      const trs = await orderStateMachine.getValidTransitions(current, 'delivery');
      setCourierStatusTransitions(trs.filter((x:any)=>['picked_up','in_transit','delivered'].includes(x.to_status)).map((x:any)=>({to_status:x.to_status,description:x.description||null})));
    } catch { setCourierStatusTransitions([]); } finally { setCourierStatusLoading(false); }
  };
  const handleSelectCourierTransition = async (to: string) => {
    if (!actionSheetTable) return;
    setCourierStatusOpen(false);
    try {
      await orderStateMachine.transitionDelivery(actionSheetTable.id, to as any, { courierId: actionSheetTable.courier_id, courierName: actionSheetTable.courier_name });
      setActionSheetTable((prev:any)=> prev ? { ...prev, delivery_status: to } : prev);
      const key = to==='picked_up'?'bds_picked_up':to==='in_transit'?'bds_in_transit':'bds_delivered';
      toast.success((t as any)(key)||to, { id:'action-toast' }); pos.fetchData();
    } catch (e:any) { toast.error(e.message||t('error_occurred'), { id:'action-toast' }); }
  };
  const handleAssignCourier = async (courierId: string, courierName: string) => {
    if (!actionSheetTable) return;
    setCourierPickerOpen(false);
    const currentStatus = actionSheetTable.delivery_status || actionSheetTable.status;
    const transitions = await orderStateMachine.getValidTransitions(currentStatus, 'delivery');
    const targetStatus = transitions.find(t => t.to_status === 'picked_up')?.to_status
      || transitions[0]?.to_status;
    if (targetStatus) {
      await orderStateMachine.transitionDelivery(actionSheetTable.id, targetStatus as any, {
        courierId,
        courierName,
      });
      // Auto-advance picked_up → in_transit after 30s
      const existing = pickedUpTimersRef.current.get(actionSheetTable.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        pickedUpTimersRef.current.delete(actionSheetTable.id);
        const current = (actionSheetTable?.delivery_status === 'picked_up')
          ? await orderStateMachine.getValidTransitions('picked_up', 'delivery')
          : [];
        const next = current.find(t => t.to_status === 'in_transit')?.to_status;
        if (next) {
          await orderStateMachine.transitionDelivery(actionSheetTable.id, next as any);
        }
      }, 30000);
      pickedUpTimersRef.current.set(actionSheetTable.id, timer);
    }
  };

  // 2026-09-23 (owner): HESAB was open-only — now a toggle (open AND close).
  const handleBillRequest = async (tableNumber: number, requested: boolean = true) => {
    try {
      const res = await apiFetch('/api/orders/bill-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: tableNumber, bill_requested: requested }),
      });
      if (res.ok) {
        if (requested) { toast.success(t('bill_called')); setActionSheetOpen(false); }
        pos.fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || t('error_occurred'));
      }
    } catch (e: any) {
      toast.error(e.message || t('error_occurred'));
    }
  };
  const handleMarkServed = async () => {
    if (!actionSheetTable) return;
    const orderId = actionSheetTable.current_order_id || actionSheetTable.order_ids?.[0] || (Array.isArray(actionSheetTable.orders) ? actionSheetTable.orders[0]?.id : undefined);
    if (!orderId) return;
    try {
      await orderStateMachine.transition(orderId, 'served');
      setActionSheetOpen(false);
      pos.fetchData();
    } catch (e: any) {
      toast.error(e.message || t('error_occurred'));
    }
  };

  // 2026-09-26 (owner, Q7): card flow now passes through the terminal
  // adapter (SIMULATOR today; real PSP on owner decision — same interface).
  const [terminalState, setTerminalState] = useState<{ amount: number; method: string; tendered?: number; tip?: number } | null>(null);
  const cartTotalNow = () =>
    Number(pos.cart?.items?.reduce((s: number, i: any) => s + (i.total_price || 0), 0) || 0) || 0;

  const runPaymentFlow = async (method: 'cash' | 'card' | 'qr' | 'transfer' | 'corporate' | 'gift_card' | 'voucher' | 'room_charge' | string, tenderedAmount?: number, tipAmount?: number, cardRef?: string) => {
    if (!actionSheetTable) return;
    const tableNumbers = actionSheetGroup
      ? [actionSheetTable.table_number, ...actionSheetGroup.children.map((c: any) => c.table_number)]
      : (actionSheetTable ? [actionSheetTable.table_number] : []);

    toast.loading(t('processing_payment'), { id: 'action-toast' });
    try {
      // For takeaway/delivery: pay for the SPECIFIC selected order
      if (posMode !== 'dine_in' && actionSheetTable?.id) {
        const specificOrderRes = await apiFetch(`/api/orders?id=eq.${actionSheetTable.id}`);
        if (!specificOrderRes.ok) throw new Error('Failed to fetch order');
        const specificData = await specificOrderRes.json();
        const specificOrder = (specificData.orders || [])[0];
        
        if (!specificOrder) {
          toast.error(t('order_not_found'), { id: 'action-toast' });
          return;
        }

        const total = specificOrder.total_amount || 0;
        const specificTip = Math.max(0, Number(tipAmount) || 0);
        const payRes = await apiFetch('/api/orders/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: specificOrder.id,
            payment_method: method,
            paid_amount: total,
            // P1 fix: tip was hardcoded 0 — now carried from the payment sheet.
            tip_amount: specificTip,
            // P2 fix: real cash tendered is recorded for cash-drawer reconciliation.
            ...(method === 'cash' && tenderedAmount ? { cash_received: Number(tenderedAmount) || 0 } : {}),
            campaign_id: specificOrder.campaign_id || undefined,
            discount_amount: specificOrder.discount_amount || 0,
            discount_type: specificOrder.discount_type || 'fixed',
            idempotency_key: payKeyFor(specificOrder.id),
          }),
        });

        if (!payRes.ok) {
          const err = await payRes.json();
          // 2026-09-23: already-paid (overpay guard) -> friendly message, not raw DB text.
          if (err.error === 'ORDER_ALREADY_PAID' || err.already_paid) {
            toast.error(t('order_already_paid'), { id: 'action-toast' });
            pos.fetchData();
            return;
          }
          toast.error(err.error || t('payment_failed'), { id: 'action-toast' });
          return;
        }

        toast.success(t('order_paid'), { id: 'action-toast' });
        const receiptSettings = await getReceiptSettings().catch(() => null);
        const paymentNow = new Date();
        setReceiptView({
          tableNumber: actionSheetTable?.table_number ?? '-',
          orderId: specificOrder.id,
          items: (specificOrder.order_items || []).map((item: any) => ({
            product_name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
            quantity: item.quantity || 1,
            total_price: Number(item.total_price || item.unit_price * item.quantity || 0),
          })),
           subtotal: Number(specificOrder.total_amount) || 0,
          discount: Number(specificOrder.discount_amount) || 0,
          discountName: specificOrder.campaigns?.name,
          // P1: specificOrder was fetched before the pay call — add the tip we just sent.
          tip: (Number(specificOrder.tip_amount) || 0) + specificTip,
          total: Number(specificOrder.total_amount) || 0,
          paymentMethod: method,
          cashAmount: method === 'cash' ? Number(specificOrder.total_amount) || 0 : 0,
          cardAmount: (method === 'card' || method === 'transfer') ? Number(specificOrder.total_amount) || 0 : 0,
          receiptTitle: receiptSettings?.receiptTitle || 'SİFARİŞ ÇEKİ',
          paymentDate: paymentNow.toLocaleDateString('az-AZ'),
          paymentTime: paymentNow.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
          staffName: receiptSettings?.staffName || '',
          // QF4: the order row historically carries tax_amount=0 (VAT is
          // embedded in menu prices) — mirror the cart's 18% tax-inclusive
          // reference line for dine-in receipts.
          taxAmount: Number(specificOrder.tax_amount) || ((specificOrder.order_type === 'takeaway' || specificOrder.order_type === 'delivery') ? 0 : (Number(specificOrder.total_amount) || 0) / 1.18 * 0.18),
          taxPct: Number(specificOrder.tax_pct) || 18,
          orderType: specificOrder.order_type || null,
          paymentMethodName: receiptSettings?.paymentMethod || '',
        });
        setReceiptTendered(method === 'cash' ? tenderedAmount : undefined);
        setPaymentView(false);
        setActionSheetOpen(false);
        pos.fetchData();
        if (pos.selectedTable && tableNumbers.includes(pos.selectedTable.table_number)) {
          pos.resetCart();
        }
        if (posMode === 'takeaway') fetchTakeawayOrders();
        if (posMode === 'delivery') fetchDeliveryOrders();
        return;
      }

      const ordersRes = await apiFetch('/api/orders');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();
      let activeOrders = (ordersData.orders || []).filter((o: any) =>
        !isFinalOrderStatus(o.status)
      );
      if (posMode === 'dine_in' && tableNumbers.length > 0) {
        activeOrders = activeOrders.filter((o: any) => tableNumbers.includes(o.table_number));
      } else if (posMode !== 'dine_in') {
        activeOrders = activeOrders.filter((o: any) => o.order_source === posMode || o.order_type === posMode);
      }
      
      if (activeOrders.length === 0) {
        toast.error(t('active_order_not_found'), { id: 'action-toast' });
        return;
      }

      const failedOrders: string[] = [];
      // 2026-09-26 (Q8 offline phase 2): offline pay = captured into the
      // local queue with the SAME deterministic idempotency key (payKeyFor),
      // auto-replayed on reconnect; 409 idempotent_conflict on duplicate
      // replay is dropped server-side. The operator sees a pending receipt.
      let queuedCount = 0;
      const manualTip = Math.max(0, Number(tipAmount) || 0);
      // P1: a manually entered tip belongs to the primary order (the one the
      // operator is paying at), not spread across all group orders.
      const tipOrderIds = new Set([activeOrders[0]?.id]);
      for (const activeOrder of activeOrders) {
        const total = activeOrder.total_amount || 0;
        const paidAmount = total;

        const res = await apiFetch('/api/orders/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: activeOrder.id,
            payment_method: method,
            paid_amount: paidAmount,
            tip_amount: tipOrderIds.has(activeOrder.id) ? manualTip : 0,
            // P2: real cash tendered recorded for cash-drawer reconciliation.
            ...(method === 'cash' && tenderedAmount ? { cash_received: Number(tenderedAmount) || 0 } : {}),
            campaign_id: activeOrder.campaign_id || undefined,
            discount_amount: activeOrder.discount_amount || 0,
            discount_type: activeOrder.discount_type || 'fixed',
            idempotency_key: payKeyFor(activeOrder.id),
            // 2026-09-26 (Q7): terminal authorization code → order_payments.reference
            ...(cardRef ? { card_reference: cardRef } : {}),
          }),
        });

        if (res.status === 202) {
          const qd = await res.json().catch(() => ({}));
          if (qd.queued) { queuedCount++; continue; }
        }

        if (!res.ok) {
          const err = await res.json();
          failedOrders.push(activeOrder.id);
          console.error(`Payment failed for order ${activeOrder.id}:`, err);
        }
      }

      if (failedOrders.length > 0) {
        const failedOrdersRaw = activeOrders.filter((o: any) => failedOrders.includes(o.id));
        setPayOutcome({ okCount: activeOrders.length - failedOrders.length, failed: failedOrdersRaw, method });
        pos.fetchData();
        if (pos.selectedTable && tableNumbers.includes(pos.selectedTable.table_number)) pos.resetCart();
        return;
      }
      if (queuedCount > 0) {
        setPayOfflinePending(true);
        toast(
          `OFFLINE: ${queuedCount} ödəniş yerli qeydə alındı — internet qayıtda avtomatik sinxronlaşacaq`,
          { id: 'action-toast' },
        );
      } else {
        setPayOfflinePending(false);
        toast.success(t('all_orders_paid'), { id: 'action-toast' });
       }

      setPaymentView(false);
      setActionSheetOpen(false);
      pos.fetchData();
      if (pos.selectedTable && tableNumbers.includes(pos.selectedTable.table_number)) {
        pos.resetCart();
      }

      // Build an on-screen receipt so the operator actually SEES what was paid
      // (previously the POS only printed silently, or did nothing).
      const tableNum = actionSheetTable?.table_number ?? activeOrders[0]?.table_number ?? '-';
      const receiptItems: { product_name: string; quantity: number; total_price: number }[] = [];
      let subtotal = 0;
      let discount = 0;
      let receiptTip = 0;
      let total = 0;
      for (const activeOrder of activeOrders) {
        for (const item of (activeOrder.order_items || [])) {
          receiptItems.push({
            product_name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
            quantity: item.quantity || 1,
            total_price: Number(item.total_price || item.unit_price * item.quantity || 0),
          });
          subtotal += Number(item.total_price || item.unit_price * item.quantity || 0);
        }
        discount += Number(activeOrder.discount_amount) || 0;
        receiptTip += Number(activeOrder.tip_amount) || 0;
        total += Number(activeOrder.total_amount) || 0;
      }
      // P1: activeOrders was fetched BEFORE the pay call, so the tip we just
      // sent (manualTip) is not yet in the rows — add it for the on-screen receipt.
      receiptTip += manualTip;
      const receiptSettings2 = await getReceiptSettings().catch(() => null);
      const paymentNow2 = new Date();
      setReceiptView({
        tableNumber: tableNum,
        orderId: activeOrders.map((o: any) => o.id).join(','),
        items: receiptItems,
        subtotal,
        discount,
        discountName: activeOrders[0]?.campaigns?.name,
        tip: receiptTip,
        total,
        paymentMethod: method,
        cashAmount: method === 'cash' ? total : 0,
        cardAmount: method === 'card' ? total : 0,
        receiptTitle: receiptSettings2?.receiptTitle || 'SİFARİŞ ÇEKİ',
        paymentDate: paymentNow2.toLocaleDateString('az-AZ'),
        paymentTime: paymentNow2.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
        staffName: receiptSettings2?.staffName || '',
        paymentMethodName: receiptSettings2?.paymentMethod || '',
        taxAmount: activeOrders.reduce((s: number, o: any) => s + (Number(o.tax_amount) || 0), 0) || ((activeOrders[0]?.order_type === 'takeaway' || activeOrders[0]?.order_type === 'delivery') ? 0 : total / 1.18 * 0.18),
        taxPct: Number(activeOrders[0]?.tax_pct) || 18,
        orderType: activeOrders[0]?.order_type || null,
      });
      setReceiptTendered(method === 'cash' ? tenderedAmount : undefined);

      // Auto-print disabled — receipt only prints via "Print Bill" action
    } catch (e: any) {
      toast.error(e.message || t('payment_error'));
    }
  };

  const handlePaymentMethodSelect = async (method: 'cash' | 'card' | 'qr' | 'transfer' | 'corporate' | 'gift_card' | 'voucher' | 'room_charge' | string, tenderedAmount?: number, tipAmount?: number) => {
    // 2026-09-28 (owner: "Kart terminalı modalını əvvəlki versiyadakı kimi
    // geri qaytar"): RESTORE the tap-to-handheld step (the 2026-09-27 bypass
    // `6b519ad8` is reverted). Card → TerminalTapModal (idle → tapping →
    // approved/declined simulator) → onDone(code) → runPaymentFlow with the
    // terminal's SIM reference. A real PSP later takes the same terminalState
    // path (Harbon/SkyPay, M wave).
    if (method === 'card') {
      setTerminalState({ amount: cartTotalNow(), method, tendered: tenderedAmount, tip: tipAmount });
      return;
    }
    await runPaymentFlow(method, tenderedAmount, tipAmount);
  };

  const handleSplitConfirm = async (split: { cash: string; card: string; items?: Record<number, 'cash' | 'card'> }, tipAmount?: number) => {
    if (!actionSheetTable && posMode === 'dine_in') return;
    const cash = parseFloat(split.cash) || 0;
    const card = parseFloat(split.card) || 0;
    // P1: tip carried from the payment sheet; attached to the first order of the split.
    const manualTip = Math.max(0, Number(tipAmount) || 0);
    const tableNumbers = actionSheetGroup
      ? [actionSheetTable.table_number, ...(actionSheetGroup.children?.map((c: any) => c.table_number) || [])]
      : (actionSheetTable ? [actionSheetTable.table_number] : []);
    toast.loading(t('processing_payment'), { id: 'action-toast' });
    try {
      const ordersRes = await apiFetch('/api/orders');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();
      let activeOrders = (ordersData.orders || []).filter((o: any) =>
        !isFinalOrderStatus(o.status)
      );
      if (posMode === 'dine_in' && tableNumbers.length > 0) {
        activeOrders = activeOrders.filter((o: any) => tableNumbers.includes(o.table_number));
      } else if (posMode !== 'dine_in') {
        activeOrders = activeOrders.filter((o: any) => o.order_source === posMode || o.order_type === posMode);
      }
      const failedOrders: string[] = [];
      const grandTotal = activeOrders.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
      const orderCount = activeOrders.length;
      if (orderCount === 0) {
        toast.error(t('order_to_pay_not_found'), { id: 'action-toast' });
        return;
      }

      // Per-item split: allocate payments to specific items
      if (split.items && Object.keys(split.items).length > 0) {
        for (const activeOrder of activeOrders) {
          const orderItems = activeOrder.order_items || [];
          let orderCash = 0;
          let orderCard = 0;
          const itemAllocations: any[] = [];
          
          for (let i = 0; i < orderItems.length; i++) {
            const item = orderItems[i];
            const itemTotal = Number(item.total_price || item.unit_price * item.quantity) || 0;
            const paymentMethod = split.items[i];
            
            if (paymentMethod === 'cash') {
              orderCash += itemTotal;
              itemAllocations.push({ amount: itemTotal, payment_method: 'cash' });
            } else if (paymentMethod === 'card') {
              orderCard += itemTotal;
              itemAllocations.push({ amount: itemTotal, payment_method: 'card' });
            }
          }
          
          const res = await apiFetch('/api/orders/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: activeOrder.id,
              payment_method: 'split',
              cash_amount: Math.round(orderCash * 100) / 100,
              card_amount: Math.round(orderCard * 100) / 100,
              tip_amount: activeOrders[0]?.id === activeOrder.id ? manualTip : 0,
              per_item_allocations: itemAllocations,
              campaign_id: activeOrder.campaign_id || undefined,
              discount_amount: activeOrder.discount_amount || 0,
              discount_type: activeOrder.discount_type || 'fixed',
              idempotency_key: payKeyFor(activeOrder.id),
            }),
          });
          
          if (!res.ok) {
            const err = await res.json();
            failedOrders.push(activeOrder.id);
            console.error(`Split payment failed for order ${activeOrder.id}:`, err);
          }
        }
      } else {
        // Proportional split across orders
        for (let i = 0; i < orderCount; i++) {
          const activeOrder = activeOrders[i];
          const orderTotal = Number(activeOrder.total_amount) || 0;
          const orderRatio = grandTotal > 0 ? orderTotal / grandTotal : 1 / orderCount;
          const orderCash = Math.round(cash * orderRatio * 100) / 100;
          const orderCard = Math.round(card * orderRatio * 100) / 100;
          const res = await apiFetch('/api/orders/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: activeOrder.id,
              payment_method: 'split',
              cash_amount: orderCash,
              card_amount: orderCard,
              tip_amount: i === 0 ? manualTip : 0,
              campaign_id: activeOrder.campaign_id || undefined,
              discount_amount: activeOrder.discount_amount || 0,
              discount_type: activeOrder.discount_type || 'fixed',
              idempotency_key: payKeyFor(activeOrder.id),
            }),
          });
          if (!res.ok) {
            const err = await res.json();
            failedOrders.push(activeOrder.id);
            console.error(`Split payment failed for order ${activeOrder.id}:`, err);
          }
        }
      }

      if (failedOrders.length > 0) {
        const failedOrdersRaw = activeOrders.filter((o: any) => failedOrders.includes(o.id));
        setPayOutcome({ okCount: activeOrders.length - failedOrders.length, failed: failedOrdersRaw, method: 'split' });
        pos.fetchData();
        if (pos.selectedTable && tableNumbers.includes(pos.selectedTable.table_number)) pos.resetCart();
        return;
      }
      toast.success(t('split_payment_complete'), { id: 'action-toast' });

      setPaymentView(false);
      setActionSheetOpen(false);
      pos.fetchData();

      // Auto-print disabled — receipt only prints via "Print Bill" action
    } catch (e: any) {
      toast.error(e.message || t('payment_error'));
    }
  };

  // QF (defect): group clear previously dismissed ONLY the parent, so the
  // group survived (G_TABLE_MULTIPLE_ORDERS) while the UI toasted success.
  // Correct sequence: unmerge the children (they keep their own orders) →
  // dismiss every child → dismiss the parent. PIN-gated, real success check.
  const handleDismissGroup = async (pin: string, reason: string) => {
    const parent = clearPinTable?.num;
    const children = clearPinTable?.children || [];
    if (parent == null) return;
    try {
      toast.loading(t('clearing_group'), { id: 'action-toast' });
      if (children.length > 0) {
        const um = await apiFetch('/api/orders/unmerge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ primary_table_number: parent, child_table_numbers: children }),
        });
        if (!um.ok) {
          const e = await um.json().catch(() => ({}));
          toast.error(`${e.error || 'Unmerge failed'} — ${t('table_clear_failed')}`, { id: 'action-toast' });
          return;
        }
      }
      for (const num of [...children, parent]) {
        const res = await apiFetch('/api/orders/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table_number: num, manager_pin: pin, reason: reason || null, terminal_id: null }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          toast.error(`${e.error || t('table_clear_failed')} (Masa ${num})`, { id: 'action-toast' });
          return;
        }
      }
      if (pos.selectedTable && pos.selectedTable.table_number === parent) pos.resetCart();
      toast.success(t('group_cleared').replace('{table}', String(parent)), { id: 'action-toast' });
    } catch {
      toast.error(t('table_clear_failed'), { id: 'action-toast' });
    }
  };

  const activeFloor = selectedFloor 
    ? pos.floors.find((f: any) => f.name === selectedFloor) 
    : pos.floors[0];

  const tableGroupInfo = useMemo(() => {
    const info: Record<number, { groupNum: number; children: number[] }> = {};
    if (activeFloor?.merged_groups) {
      activeFloor.merged_groups.forEach((g: any, idx: number) => {
        info[g.parent.table_number] = {
          groupNum: idx + 1,
          children: g.children?.map((c: any) => c.table_number) || []
        };
      });
    }
    return info;
  }, [activeFloor?.merged_groups]);

  const visibleTables = useMemo(() => {
    if (!activeFloor?.tables) return [];
    return activeFloor.tables.filter((table: any) => {
      const isChild = table.parent_table_number && table.table_number !== table.parent_table_number;
      // QA bug 10 (2026-09-22): 75+ archived test tables (1104–1605) cluttered
      // the floor grid. Archived tables are immutable (DB trigger) and
      // non-operational — hide them from the live floor entirely.
      if (table.is_archived) return false;
      return !isChild;
    });
  }, [activeFloor?.tables]);

  // Waitlist (2026-09-25): empty tables offered in the "Oturduul" table picker.
  const emptyTables = useMemo(
    () => visibleTables
      .filter((t: any) => t.status === 'empty')
      .map((t: any) => ({ table_number: t.table_number, seats: t.seats ?? t.capacity ?? null })),
    [visibleTables]
  );

  // 2026-09-25 (owner: "o dursun, digəri gəlsin"): when a table just became
  // EMPTY while the queue has people, propose seating the head of the queue.
  const prevTableStatusRef = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    if (posMode !== 'dine_in' || !waitlistEnabled) return;
    const prev = prevTableStatusRef.current;
    const next = new Map<number, string>();
    for (const t of visibleTables) next.set(t.table_number, t.status);
    if (waitlistCount > 0 && prev.size > 0) {
      for (const [num, status] of next) {
        const was = prev.get(num);
        if (was && was !== 'empty' && status === 'empty') {
          toast.success(`Masa ${num} boşaldı — növbədə ${waitlistCount} qonaq gözləyir`, {
            id: `waitlist-table-${num}`,
            duration: 8000,
            action: { label: 'Oturdur', onClick: () => setWaitlistOpen(true) },
          });
        }
      }
    }
    prevTableStatusRef.current = next;
  }, [visibleTables, posMode, waitlistEnabled, waitlistCount]);

  const openTableWithPulse = (table: any) => {
    setTableTapPulse({ tableNumber: table.table_number, nonce: Date.now() });
    if (tableTapTimerRef.current) clearTimeout(tableTapTimerRef.current);
    tableTapTimerRef.current = setTimeout(() => {
      tableTapTimerRef.current = null;
      pos.selectTable(table);
    }, 150);
  };

  const handleTableTap = (table: any) => {
    // Archived tables: DB trigger already blocks ordering (TABLE_ARCHIVED);
    // the UI guard stops the navigation attempt up front with a clear toast.
    if (table?.is_archived) {
      toast.error((t as any)('archived_table_info') || 'Bu masa arxivlənib — sifariş oluna bilməz', { id: 'action-toast' });
      return;
    }
    if (posMode !== 'dine_in') {
      toast.error(t('table_selection_disabled'), { id: 'action-toast' });
      return;
    }

    playHapticSound('select');

    if (table.status === 'empty' && !mergeMode && !transferMode) {
      pos.exitReservationMode();
      setReservationMode(false);
      setReservationId(null);
      setReservationGuest(null);
      openTableWithPulse(table);
      return;
    }

    if (table.status === 'reserved' && !reservationMode) {
      pos.enterReservationMode(table);
      return;
    }

    if (mergeMode) {
      if (selectedForMerge.includes(table.table_number)) {
        setSelectedForMerge(p => p.filter(n => n !== table.table_number));
      } else {
        const next = [...selectedForMerge, table.table_number];
        setSelectedForMerge(next);
        if (next.length === 2) {
          // QF1 (audit 2026-09-21): unify merge with the transfer flow — the
          // moment the second table is tapped, open the sheet's confirm bar
          // (parent = first tap). Previously the floor-tap merge showed a
          // floating preview bar whose "Təsdiqlə" only opened the sheet, so
          // merge took one extra confusing step and looked different from
          // transfer (tap A → tap B → confirm). 3+ tables still use the
          // floating bar below.
          const parentTable = visibleTables?.find((t: any) => t.table_number === next[0]) || null;
          setActionSheetTable(parentTable);
          setActionSheetOpen(true);
        }
      }
      return;
    }

    if (transferMode) {
      if (!transferSource) {
        const t = table;
        if (!t || t.status === 'empty') {
          toast.error(t('transfer_from_empty_table'));
          return;
        }
        setTransferSource(table.table_number);
        toast(t('source_select_target').replace('{table}', String(table.table_number)));
      } else if (table.table_number === transferSource) {
        toast.error(t('same_table_selected'));
      } else {
        setTransferTarget(table.table_number);
        setTransferConfirm(true);
        // QF1: same pattern as merge — the confirm bar lives in the ActionSheet
        // (currentView='transfer'); open it on the source table immediately.
        const sourceTable = visibleTables?.find((t: any) => t.table_number === transferSource) || null;
        setActionSheetTable(sourceTable);
        setActionSheetOpen(true);
      }
      return;
    }

    if (['occupied', 'cooking', 'waiting_bill', 'waiting'].includes(table.status)) {
      setFlashInfo({ tableNumber: table.table_number, nonce: Date.now() });
    }
    pos.exitReservationMode();
    setReservationMode(false);
    setReservationId(null);
    setReservationGuest(null);
    openTableWithPulse(table);
  };

  const handleConfirmTransfer = async (targetTable?: number) => {
    if (!transferSource || !targetTable) return;
    try {
      const res = await apiFetch('/api/orders/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_table: transferSource,
          to_table: targetTable,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastUndo({ 
          action: 'transfer', 
          data: data.undo, 
          message: `Masa ${transferSource} → ${targetTable}`,
          timestamp: Date.now()
        });
        toast.success(t('table_transferred'));
        setTimeout(() => setLastUndo(null), 5000);
        setTransferMode(false);
        setTransferSource(null);
        setTransferTarget(null);
        if (pos.selectedTable && pos.selectedTable.table_number === transferSource) {
          pos.resetCart();
        }
        await pos.fetchData();
        const freshFloorsRes = await apiFetch('/api/pos/tables');
        const freshFloors = freshFloorsRes.ok ? (await freshFloorsRes.json()).floors || [] : pos.floors;
        const allTables = freshFloors.flatMap((f: any) => f.tables || []);
        const openedSource = pos.selectedTable && pos.selectedTable.table_number === transferSource;
        if (openedSource) {
          const target = allTables.find((t: any) => t.table_number === targetTable);
          if (target) pos.selectTable(target);
        }
      } else {
        toast.error(data.error || t('transfer_failed'));
        setTransferMode(false);
        setTransferSource(null);
        setTransferTarget(null);
      }
    } catch (e: any) {
      toast.error(e.message || t('transfer_error'));
      setTransferMode(false);
      setTransferSource(null);
      setTransferTarget(null);
    }
  };

  const handleCancelTransfer = () => {
    setTransferMode(false);
    setTransferSource(null);
    setTransferTarget(null);
  };

  const handleGuestArrived = async (table: { table_number: number; reservation_id: string | null; name: string | null; guests: number }) => {
    const resId = table.reservation_id;
    setReservationArrival(null);
    if (!resId) {
      toast.error(t('reservation_id_not_found'));
      return;
    }
    try {
      const seatRes = await apiFetch('/api/reservations/guest-arrived', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: resId, performed_by: posSession?.staffId || null }),
      });
      const seatData = seatRes.ok ? await seatRes.json().catch(() => null) : null;
      if (!seatRes.ok) {
        const err = seatData || { error: t('guest_not_arrived') };
        toast.error(err.error || t('guest_not_arrived'));
        return;
      }
      const data = seatData;
      if (data?.success) {
        toast.success(t('guest_arrived'));
        await pos.fetchData();
        try {
          const freshRes = await apiFetch('/api/pos/tables');
          if (freshRes.ok) {
            const freshData = await freshRes.json();
            const allTables = (freshData.floors || []).flatMap((f: any) => f.tables || []);
            const opened = allTables.find((t: any) => t.table_number === table.table_number);
            if (opened) pos.selectTable(opened, { allowReserved: true });
          }
        } catch { /* fallback to stale data */ }
      } else {
        toast.error(t('guest_not_arrived'));
      }
    } catch (e: any) {
      toast.error(e.message || t('error_occurred'));
    }
  };

  const resolveSheetOrderId = () =>
    actionSheetTable?.current_order_id
    || actionSheetTable?.orders?.[0]?.id
    || (Array.isArray(actionSheetTable?.order_ids) ? actionSheetTable.order_ids[0] : undefined)
    || null;

  const reconcileOrderFromServer = async (orderId: string) => {
    try {
      const ordRes = await apiFetch('/api/orders');
      if (!ordRes.ok) return;
      const ordData = await ordRes.json();
      const order = (ordData.orders || []).find((o: any) => o.id === orderId);
      if (!order) return;
      const touchesCurrent = pos.selectedTable
        && (pos.selectedTable.current_order_id === orderId
          || (pos.selectedTable.table_number != null && order.table_number === pos.selectedTable.table_number));
      if (touchesCurrent && pos.activeView === 'order') {
        pos.resetCart();
        pos.loadOrderIntoCart(order);
      }
    } catch { /* stale cart acceptable; floors still refreshed */ }
  };

  // Sprint-1: core discount submit. If the server answers requires_approval
  // (no discount.approve for the session user) and no approver is present yet,
  // open the PIN guard and re-run with the verified manager staffId.
  const doSubmitDiscount = async (approverStaffId?: string | null) => {
    const orderId = resolveSheetOrderId();
    const value = parseFloat(discountValue);
    if (!orderId || isNaN(value) || value <= 0) return;
    setDiscountBusy(true);
    toast.loading(t('processing_discount'), { id: 'discount-toast' });
    try {
      const res = await apiFetch('/api/orders/discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          discount_type: discountType,
          discount_value: value,
          reason: discountReason.trim() || undefined,
          approver_staff_id: approverStaffId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.requires_approval && !approverStaffId) {
          setDiscountPinOpen(true);
          return;
        }
        toast.error(data.error || t('error_occurred'), { id: 'discount-toast' });
        return;
      }
      toast.success(t('discount_applied'), { id: 'discount-toast' });
      setDiscountOpen(false);
      setDiscountValue('');
      setDiscountReason('');
      await pos.fetchData();
      await reconcileOrderFromServer(orderId);
    } catch (e: any) {
      toast.error(e.message || t('error_occurred'), { id: 'discount-toast' });
    } finally {
      setDiscountBusy(false);
    }
  };

  const submitDiscount = async () => {
    if (discountBusy) return;
    await doSubmitDiscount(null);
  };

  // 2026-09-22 (OrderInfoStrip): zone select + auto-fee — moved out of the
  // old inline <select> (same RPC + same semantics as before).
  // 2026-09-23 (owner): the RPC's is_free flag is now RESPECTED — before, a
  // cart above the zone's free-delivery threshold still paid the full fee
  // (DB: calculate_delivery_fee returns {fee:2, is_free:true} at ₼100).
  // 2026-09-26 (owner, Task 50): fee RPC in flight → shimmer "hesablayır…"
  const [deliveryFeeCalculating, setDeliveryFeeCalculating] = useState(false);
  // 2026-09-26 (owner, Task 55): live smart-surge info for the fee hint
  // (weather/peak multiplier + reason + base fee) — Wolt-class badge.
  const [deliverySurge, setDeliverySurge] = useState<{ mult: number; reason: 'weather' | 'peak'; base: number } | null>(null);

  const recalcDeliveryFee = useCallback(async (cart: any, zoneName: string | null | undefined) => {
    if (!cart || !zoneName) return;
    const zone = deliveryZones.find(z => z.name === zoneName);
    if (!zone) return;
    const itemsTotal = (cart.items || []).reduce((s: number, i: any) => s + (i.unit_price || 0) * (i.quantity || 0), 0);
    let fee = Number(zone.fee) || 0;
    // 2026-09-26 (owner, Task 50): Wolt-style — an entered KM distance re-resolves
    // the zone by km-range and re-prices (distance overload). No KM → explicit
    // zone name overload. The surge multiplier is applied server-side.
    const km = Number(cart.delivery_km);
    let resolvedZone: string | null = null;
    // 2026-09-26 (Task 55): hoisted so the smart-surge capture below the
    // try/catch can read it (block-scoped `data` was out of scope there).
    let rpcData: any = null;
    setDeliveryFeeCalculating(true);
    try {
      const body = km >= 0.1
        ? { p_order_amount: itemsTotal, p_distance_km: km }
        : { p_zone_name: zone.name, p_order_amount: itemsTotal, p_customer_address: cart.delivery_address || null };
      const res = await apiFetch('/api/rpc/calculate_delivery_fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        rpcData = await res.json();
        const data: any = rpcData;
        const rpcFee = Number(typeof data === 'number' ? data : data?.fee ?? fee) || 0;
        fee = data?.is_free ? 0 : rpcFee;
        // KM-resolution may pick a different zone (km-range) — remember it; the
        // single persist below commits it (no double-setCart race).
        if (km >= 0.1 && data?.zone) resolvedZone = data.zone;
      }
    } catch { /* keep the zone's base fee */ } finally {
      setDeliveryFeeCalculating(false);
    }
    // 2026-09-23 (owner, Wolt-like): a matching active FREE_DELIVERY campaign
    // zeroes the fee — display mirrors the server (which is authoritative at
    // creation; E2E probe #D049: cart said ₼2, server billed ₼0).
    if (fee > 0) {
      try {
        const productIds = Array.from(new Set((cart.items || []).map((i: any) => i.product_id).filter(Boolean))) as string[];
        const { data: camps } = await supabase
          .from('campaigns')
          .select('id, applicable_products, applicable_categories, target_type, target_id, min_purchase_amount, start_date, end_date')
          .eq('type', 'FREE_DELIVERY')
          .eq('status', 'active')
          .eq('is_active', true)
          .limit(20);
        const now = new Date();
        const match = (camps || []).some((c: any) => {
          if (c.start_date && new Date(c.start_date) > now) return false;
          if (c.end_date && new Date(c.end_date) < now) return false;
          if (c.min_purchase_amount && Number(c.min_purchase_amount) > 0 && itemsTotal < Number(c.min_purchase_amount)) return false;
          const productHit = (c.applicable_products || []).some((p: string) => productIds.includes(p))
            || (c.target_type === 'product' && !!c.target_id && productIds.includes(String(c.target_id)));
          const global = !(c.applicable_products || []).length && !(c.applicable_categories || []).length && !c.target_id;
          return productHit || global;
        });
        if (match) fee = 0;
      } catch { /* server decides at creation */ }
    }
    // 2026-09-23 (E2E catch): ALWAYS persist — the old "only if fee changed"
    // guard skipped setCart when a campaign made the fee 0 == current 0, so
    // delivery_zone was never stored and the zone chip stayed unselected.
    // 2026-09-26 (Task 50): also persist the KM-distance-resolved zone.
    pos.setCart({ ...cart, delivery_zone: resolvedZone || cart.delivery_zone, delivery_fee: fee });
    // 2026-09-26 (Task 55): carry the server smart-surge badge (weather/peak)
    // to the panel hint; null when no surge is active.
    setDeliverySurge(rpcData?.smart_surge ? { mult: Number(rpcData.smart_surge), reason: rpcData.smart_surge_reason, base: Number(rpcData.base_fee) || 0 } : null);
    // No loop risk: the recalc effect deps are itemsTotal/zoneName, not cart identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryZones]);

  const handleZoneSelect = async (zoneName: string) => {
    if (!pos.cart) return;
    const nextCart = { ...pos.cart, delivery_zone: zoneName || null };
    if (!zoneName) {
      pos.setCart({ ...nextCart, delivery_fee: 0 });
      setDeliverySurge(null); // no zone → no fee → no surge badge
      return;
    }
    const zone = deliveryZones.find(z => z.name === zoneName);
    if (!zone) {
      pos.setCart({ ...nextCart, delivery_fee: 0 });
      setDeliverySurge(null);
      return;
    }
    await recalcDeliveryFee(nextCart, zoneName);
  };

  // 2026-09-23 (owner): the fee now reacts to the CART — crossing the zone's
  // free-delivery threshold (or a campaign-driven change) updates the fee
  // live. Watch only the items-total, so typing in address fields doesn't
  // thrash.
  const deliveryItemsTotal = posMode === 'delivery'
    ? (pos.cart?.items || []).reduce((s: number, i: any) => s + (i.unit_price || 0) * (i.quantity || 0), 0)
    : 0;
  const deliveryZoneName = posMode === 'delivery' ? pos.cart?.delivery_zone : null;
  useEffect(() => {
    if (!pos.cart || !deliveryZoneName || (pos.cart.items || []).length === 0) return;
    const t = setTimeout(() => { recalcDeliveryFee(pos.cart, deliveryZoneName); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryItemsTotal, deliveryZoneName, !!pos.cart]);

  // Shared cart-send path (U-4): used by the CartPanel "Send" button AND by
  // the unsent-cart guard modal, so both execute identical logic.
  const sendCurrentOrder = () => {
    if (pos.reservationMode) {
      pos.savePreOrder();
      return;
    }
    if (posMode !== 'dine_in') {
      const phone = pos.cart?.customer_phone?.trim();
      if (posMode === 'delivery' && !phone) {
        setPosPhase('customer');
        setCustomerFocus({ field: 'customer_phone', n: Date.now() });
        toast.error(t('enter_phone'));
        return;
      }
      if (posMode === 'delivery' && !pos.cart?.delivery_address?.trim()) {
        setPosPhase('customer');
        setCustomerFocus({ field: 'delivery_address', n: Date.now() });
        toast.error(t('enter_address'));
        return;
      }
      // Delivery Phase 2 (2026-09-24): live gates — accepting pause + min
      // order. The server enforces the SAME rules in /api/orders
      // (DELIVERY_PAUSED / DELIVERY_MIN_ORDER); these are the fast client UX.
      if (posMode === 'delivery' && deliveryGates.accepting === false) {
        setPosPhase('customer');
        toast.error('Çatdırılma sifarişləri hazırda qəbul edilmir');
        return;
      }
      if (posMode === 'delivery') {
        const selZone = deliveryZones.find(z => z.name === pos.cart?.delivery_zone);
        const zMin = selZone?.min_order != null ? Number(selZone.min_order) : 0;
        const minOrder = zMin > 0 ? zMin : (deliveryGates.minOrder != null ? Number(deliveryGates.minOrder) : 0);
        if (minOrder > 0 && deliveryItemsTotal < minOrder) {
          setPosPhase('customer');
          toast.error(`Min sifariş ₼${minOrder.toFixed(0)} — ₼${(minOrder - deliveryItemsTotal).toFixed(0)} daha əlavə edin`);
          return;
        }
      }
      if (posMode === 'takeaway' && !pos.cart?.customer_name?.trim()) {
        // Takeaway name = the "call-out" name: soft gate — enter the
        // customer phase focused on the name field (no hard error toast).
        setPosPhase('customer');
        setCustomerFocus({ field: 'customer_name', n: Date.now() });
        return;
      }
      pos.placeOrder(undefined, {
        customer_phone: phone,
        customer_name: pos.cart?.customer_name || undefined,
        customer_note: pos.cart?.notes || undefined,
        delivery_address: pos.cart?.delivery_address || undefined,
        delivery_fee: pos.cart?.delivery_fee || 0,
        estimated_delivery_time: pos.cart?.estimated_delivery_time || undefined,
        payment_method: pos.cart?.payment_method || 'cash',
      }, posSession?.staffId);
      // QF7: the TA/delivery list must not sit stale after a send — realtime
      // + the 15s poll cover it, but refresh immediately (600ms) for UX.
      window.setTimeout(() => {
        if (posMode === 'takeaway') fetchTakeawayOrders();
        if (posMode === 'delivery') fetchDeliveryOrders();
      }, 600);
    } else {
      const autoCampaign = pos.getAutoCampaign(pos.cart);
      pos.placeOrder(autoCampaign ? { id: autoCampaign.id, type: 'AUTO' } : undefined, undefined, posSession?.staffId);
    }
  };

  // Customer linking (single source of truth): pick from the shared customers
  // DB — used by BOTH the cart panel's "müşəri əlavə et" input and the
  // ActionSheet customer section, so the linked customer (id + name + phone,
  // for loyalty/points) stays consistent across both surfaces.
  const handleSelectCustomer = (customerId: string | null, customerName: string | null, customerPhone?: string | null) => {
    pos.updateCartCustomer(customerId, customerName, customerPhone ?? null);
    // OS BUILD #1b: the order may already exist (table opened earlier) —
    // cart state alone would send points to the wrong/none customer.
    // PATCH the live order so the loyalty spine credits the right one.
    const oid = actionSheetTable?.current_order_id || actionSheetTable?.orders?.[0]?.id || pos.selectedTable?.current_order_id || (pos.selectedTable as any)?.orders?.[0]?.id;
    if (oid) {
      void (async () => {
        try {
          await apiFetch('/api/orders/customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: oid, customer_id: customerId, customer_name: customerName, customer_phone: customerPhone || null }),
          });
        } catch { /* non-blocking: earn falls back to order's prior customer */ }
      })();
    }
  };

  // (U-4 closeCartPanel removed 2026-09-21: it called pos.clearCart() and was
  // the reason for the unsent-guard-on-exit. Exit now keeps the draft.)

  // Escape key (2026-09-21 QA): payment view → back; action sheet → close.
  // Previously Escape did nothing on these modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (paymentView && actionSheetOpen) { setPaymentView(false); return; }
      if (actionSheetOpen) { setActionSheetOpen(false); setActionSheetTable(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paymentView, actionSheetOpen]);


  const retryFailedPayments = async () => {
    if (!payOutcome) return;
    const { failed, method } = payOutcome;
    const stillFailed: any[] = [];
    let retried = 0;
    for (const order of failed) {
      const total = Number(order.total_amount) || 0;
      const res = await apiFetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          payment_method: method,
          paid_amount: total,
          tip_amount: 0,
          campaign_id: order.campaign_id || undefined,
          discount_amount: order.discount_amount || 0,
          discount_type: order.discount_type || 'fixed',
          idempotency_key: payKeyFor(order.id),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t('payment_failed') }));
        stillFailed.push({ ...order, error: (err.error === 'ORDER_ALREADY_PAID' || err.already_paid) ? t('order_already_paid') : err.error });
      } else {
        retried++;
      }
    }
    if (stillFailed.length === 0) {
      toast.success(t('all_orders_paid'), { id: 'action-toast' });
      setPayOutcome(null);
      pos.fetchData();
      if (pos.selectedTable) pos.resetCart();
    } else {
      setPayOutcome({ okCount: payOutcome.okCount + retried, failed: stillFailed, method });
    }
  };

  const handleUndo = async () => {
    if (!lastUndo || !lastUndo.data) return;
    if (lastUndo.action === 'transfer') {
      try {
        const res = await apiFetch('/api/orders/transfer', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_table: lastUndo.data.from_table,
            to_table: lastUndo.data.to_table,
            orders: lastUndo.data.orders,
            table: lastUndo.data.table,
            targetTable: lastUndo.data.targetTable,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(t('transfer_reverted'));
          setLastUndo(null);
          pos.fetchData();
        } else {
          toast.error(data.error || t('revert_failed'));
        }
      } catch (e: any) {
        toast.error(e.message || t('revert_error'));
      }
      return;
    }
    if (lastUndo.action === 'unmerge') {
      try {
        const res = await apiFetch('/api/orders/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unmerge', data: lastUndo.data }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(t('split_reverted'));
          setLastUndo(null);
          pos.fetchData();
        } else {
          toast.error(data.error || t('revert_failed'));
        }
      } catch (e: any) {
        toast.error(e.message || t('revert_error'));
      }
      return;
    }
    await pos.performUndo();
  };

  const handleUnmerge = async () => {
    if (!actionSheetTable) return;
    if (selectedForUnmerge.length === 0) {
      toast.error(t('select_table_first'), { id: 'action-toast' });
      return;
    }
    try {
      const res = await apiFetch('/api/orders/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_table_number: actionSheetTable.table_number, child_table_numbers: selectedForUnmerge }),
      });
      const result = res.ok ? await res.json() : { error: (await res.json()).error || t('error') };
      if (res.ok) {
        toast.success(t('tables_split'), { id: 'action-toast' });
        setUnmergeMode(false);
        setSelectedForUnmerge([]);
        setActionSheetOpen(false);
        pos.fetchData();
        if (pos.selectedTable) {
          const affectedTables = [actionSheetTable.table_number, ...selectedForUnmerge];
          if (affectedTables.includes(pos.selectedTable.table_number)) {
            const freshFloorsRes = await apiFetch('/api/pos/tables');
            const freshFloors = freshFloorsRes.ok ? (await freshFloorsRes.json()).floors || [] : pos.floors;
            const allTables = freshFloors.flatMap((f: any) => f.tables || []);
            const updatedTable = allTables.find((t: any) => t.table_number === pos.selectedTable?.table_number);
            if (updatedTable) pos.selectTable(updatedTable);
          }
        }
        if (result.undo) {
          setLastUndo({
            action: 'unmerge',
            data: { ...result.undo, action: 'unmerge' },
            message: t('table_split_short').replace('{table}', String(actionSheetTable.table_number)),
            timestamp: Date.now(),
          });
          setTimeout(() => setLastUndo(null), 5000);
        }
      } else {
        toast.error(result.error || t('split_failed'), { id: 'action-toast' });
      }
    } catch (e: any) {
      toast.error(e.message || t('split_error'), { id: 'action-toast' });
    }
  };

  const actionSheetGroup = activeFloor?.merged_groups?.find((g: any) => 
    g.parent.table_number === actionSheetTable?.table_number
  );

   const handleOpenAction = (table: any) => {
    if (table?.is_archived) {
      toast.error((t as any)('archived_table_info') || 'Bu masa arxivlənib — sifariş oluna bilməz', { id: 'action-toast' });
      return;
    }
    playHapticSound('on');
    if (posMode !== 'dine_in') {
      setActionSheetTable({
        table_number: null,
        total_amount: pos.cart?.items?.reduce((s: number, i: any) => s + (i.total_price || 0), 0) || 0,
        status: posMode,
        order_source: posMode,
      } as any);
      setActionSheetOpen(true);
      return;
    }
    if (table?.status === 'reserved') {
      setReservationArrival({
        table_number: table.table_number,
        reservation_id: table.reservation_id || null,
        name: table.reservation_name || null,
        guests: table.guest_count || 0,
        phone: table.reservation_phone || null,
        time: table.reservation_time || null,
        is_vip: table.is_vip || false,
        // 2026-09-26 (owner, Task 49): carry the table-hold deposit so the
        // sheet can show the "Depozit ₼X" line (was dropped here).
        deposit_amount: (table as any).deposit_amount ?? null,
      });
      return;
    }
    const parentNum = table.parent_table_number || table.table_number;
    const parent = activeFloor?.tables?.find((t: any) => t.table_number === parentNum) || table;
    setActionSheetTable(parent);
    setActionSheetOpen(true);
  };

  return (
    <VirtualKeyboardProvider>
    <div className="flex-1 min-h-0 w-full h-full flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      {/* Loading state while session is being validated */}
      {!posSession && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <p className="text-xs text-white/30 font-bold uppercase tracking-widest">{t('loading')}</p>
           </div>
          </div>
        )}

       {/* MODE SWITCHER — always visible */}
           <div className="flex items-center gap-4 px-6 pt-2 pb-2">
            <h1 className="text-2xl font-black tracking-tighter">POS</h1>
            <div ref={tabGroupRef} className="flex-shrink-0">
            <DragTabSwitcher
              items={[
                { id: 'dine_in', label: t('dine_in'), icon: Utensils, dotColor: '#10b981' },
                { id: 'takeaway', label: t('takeaway'), icon: UserCheck, dotColor: '#3b82f6' },
                { id: 'delivery', label: t('delivery'), icon: Bike, dotColor: '#3b82f6' },
              ]}
              value={posMode}
              onBeforeChange={handleTabMorph}
              onChange={(mode) => {
                // Delivery Phase 2: master switch off → the delivery mode is
                // not reachable from the chip (settings.delivery_enabled).
                if (mode === 'delivery' && !deliveryGates.enabled) {
                  toast.error('Çatdırılma hazırda fəaliyyətə deyil — Ayarlar → Çatdırılma');
                  return;
                }
                pos.switchMode(mode as 'dine_in' | 'takeaway' | 'delivery');
                pos.setActiveView('floor');
              }}
            />
            </div>
            {pos.floors.length > 1 && posMode === 'dine_in' ? (
              // Wrapper carries the dim (150ms) during the ghost flight and
              // exposes data-floor-chip for the E2E rect trace.
              <div
                ref={chipWrapRef}
                data-floor-chip
                style={{ opacity: chipDimmed ? 0 : 1, transition: 'opacity 150ms ease' }}
              >
                <LiquidDropdown
                  floorChip
                  options={pos.floors.map((f: any) => ({ id: f.name, label: f.name }))}
                  activeId={activeFloor?.name}
                  onChange={setSelectedFloor}
                />
              </div>
          ) : pos.floors.length > 1 ? (
            <div className="w-[120px]" />
          ) : null}
            {/* The morph GHOST (2026-09-27): chip-styled fixed-position flight
                between the chip slot and the active tab pill. OUT = box→point
                + fade out (chip dissolves into the pill); IN = point→box +
                fade in (chip emerges from the pill). 'in' runs 340ms so it
                lands exactly when the pill arrival flips posMode. */}
            {morphGhost && (
              <motion.div
                key={morphGhost.id}
                data-floor-chip-ghost
                // left-0 top-0 is CRITICAL: this is a fixed element and Framer
                // x/y are TRANSFORMS added to the element's flow position.
                // Without the origin anchor the flight renders offset by the
                // element's own flow slot (E2E measured +346/+68 — the ghost
                // flew from the wrong corner). Anchored at (0,0), the traced
                // viewport rects land EXACTLY on the chip box / pill center.
                // Silhouette MUST mirror the floorChip trigger (px-4 → dot at
                // 16px from the left edge; overflow-hidden clips the dot into
                // the point as the pill shrinks).
                className={`fixed left-0 top-0 z-[150] pointer-events-none rounded-full border overflow-hidden ${lightMode ? 'bg-zinc-100 border-zinc-200/70' : 'bg-white/[0.06] border-white/[0.10]'}`}
                initial={{ x: morphGhost.from.x, y: morphGhost.from.y, width: morphGhost.from.w, height: morphGhost.from.h, opacity: morphGhost.dir === 'out' ? 1 : 0 }}
                animate={{ x: morphGhost.to.x, y: morphGhost.to.y, width: morphGhost.to.w, height: morphGhost.to.h, opacity: morphGhost.dir === 'out' ? 0 : 1 }}
                transition={{ duration: morphGhost.dir === 'in' ? 0.34 : 0.26, ease: [0.45, 0, 0.55, 1] }}
                onAnimationComplete={() => {
                  setMorphGhost(null);
                  if (morphGhost.dir === 'in') setChipDimmed(false);
                }}
              >
                {/* floor dot travels with the ghost (clipped into the point on shrink) */}
                <span
                  aria-hidden
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: lightMode ? '#10b981' : 'rgba(52,211,153,0.9)' }}
                />
              </motion.div>
            )}
           <div className="flex-1" />
           {/* pr v1 — print queue badge (queued jobs for this location) */}
           {(printQueue.queued > 0 || printQueue.claimed > 0) && (
             <div
               className="flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-black text-gold bg-gold/10 border-gold/30"
               title={`Çap növbəsi: ${printQueue.queued} gözləyir, ${printQueue.claimed} yazılır`}
             >
               <Printer size={15} />
               {printQueue.claimed > 0 ? printQueue.claimed : printQueue.queued}
             </div>
           )}
            <button
              onClick={() => setOrderHistoryOpen(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              title={t('order_history')}
            >
              <History size={16} />
              <span className="hidden sm:inline">{t('history')}</span>
            </button>
          {isCashierOrAdmin && (
            <button
              onClick={() => setCashDrawerOpen(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              title={t("cash_drawer")}
            >
              <Wallet size={16} />
              <span className="hidden sm:inline">{t('cash_drawer')}</span>
            </button>
          )}
            {posSession && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40" />
                  {/* Owner request (2026-09-22): show the STAFF ROLE, not the
                      raw name ("DEV User" was cryptic). Role in caps, real
                      name on hover. */}
                  <span className="text-xs font-bold uppercase tracking-wider text-white/30 hidden sm:inline" title={posSession.name}>
                    {String(posSession.role || '').toUpperCase() || posSession.name}
                  </span>
                </div>
                 {/* Shift clock buttons removed by owner request (2026-09-21).
                     The X logout here was ALSO removed (2026-09-22, owner):
                     the app has ONE login path (staff login) and ONE logout —
                     the standard sidebar / nav-dock logout. */}
              </div>
            )}
           {activeStaff.length > 0 && (
             <div className="flex items-center gap-1">
               <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
               <span className="text-xs font-black text-emerald-400">{activeStaff.length} aktiv</span>
             </div>
           )}
        </div>
      <AnimatePresence mode="wait">
        {posMode === 'dine_in' && pos.activeView === 'floor' && pos.loading && (
           <div key="floor-skeleton" className="h-full flex flex-col p-6">
            <FloorSkeleton />
          </div>
        )}

         {posMode === 'dine_in' && pos.activeView === 'floor' && !pos.loading && (
                <motion.div key="floor"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fastExit}
                  className="h-full flex flex-col p-6"
                >
                <AnimatePresence mode="wait" initial={false}>
                {cleanMode ? (
                    <motion.div
                      key="clean-toolbar"
                      initial={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -12, filter: 'blur(4px)', transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
                      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                     // QA bug 17 (2026-09-22): pinned header — flex-shrink-0 so
                     // the toolbar can never be squeezed by the scroll region.
                     className="flex-shrink-0 flex items-center justify-end gap-3 mb-6"
                   >
                     <div className="flex items-center gap-2">
                      {/* 2026-09-25 (owner): NÖVBƏ buraya — REZERVSİYALAR-ın SOLUNA
                          (global top-right sətirdən köçürüldü). */}
                      {posMode === 'dine_in' && waitlistEnabled && (
                        <button
                          onClick={() => setWaitlistOpen(true)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'border-indigo-500/30 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}
                          title="Növbə (Waitlist)"
                        >
                          <Hourglass size={16} />
                          <span className="hidden sm:inline">Növbə</span>
                          {waitlistCount > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-black tabular-nums flex items-center justify-center leading-none">
                              {waitlistCount}
                            </span>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => router.push('/admin/reservations')}
                       className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100' : 'border-white/10 text-white/80 hover:text-white hover:bg-white/10'}`}
                       title={t('reservations')}
                     >
                       <Calendar size={16} />
                       <span className="hidden sm:inline">{t('reservations')}</span>
                     </button>
                       <div className={`flex items-center gap-1 rounded-full p-1 ${lightMode ? 'bg-zinc-100' : 'bg-white/5'}`}>
                       {[
                           { active: !mergeMode && !transferMode, label: t('normal_mode') },
                           { active: mergeMode, label: t('merge') },
                           { active: transferMode, label: t('transfer') },
                        ].map(({ active, label }) => (
                          <button
                            key={label}
                            onClick={() => {
                               playHapticSound('tap');
                               if (label === t('normal_mode')) { setMergeMode(false); setTransferMode(false); setSelectedForMerge([]); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); setActionSheetOpen(false); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                                if (label === t('merge')) { setMergeMode(true); setTransferMode(false); setSelectedForMerge([]); setTransferConfirm(false); setActionSheetOpen(false); setActionSheetTable(null); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                                if (label === t('transfer')) { setMergeMode(false); setTransferMode(true); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); setActionSheetOpen(false); setActionSheetTable(null); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                            }}
      className="relative px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] duration-200 z-10"
      style={{ color: active ? (lightMode ? '#ffffff' : '#000000') : lightMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)' }}
    >
       {active && (
         <AnimatePresence>
           <motion.div
             key={`action-pill-${label}`}
              layoutId="action-mode-pill-clean"
              className={`absolute inset-0 rounded-full z-0 ${lightMode ? 'bg-zinc-900' : 'bg-white'}`}
                                   transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.4 }}
                                 />
                               </AnimatePresence>
                              )}
                            <span className="relative z-10">{label}</span>
                          </button>
                        ))}
                      </div>
                     </div>
                   </motion.div>
                ) : (
                    <motion.div
                      key="normal-toolbar"
                      initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: 12, filter: 'blur(4px)', transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
                      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                     className="flex-shrink-0"
                   >
                      <div className="flex items-center justify-end gap-3 mb-6">
                      {/* 2026-09-25 (owner): NÖVBƏ — REZERVSİYALAR-ın SOLUNA (normal toolbar
                          branch; the clean-mode branch has its own copy). */}
                      {posMode === 'dine_in' && waitlistEnabled && (
                        <button
                          onClick={() => setWaitlistOpen(true)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'border-indigo-500/30 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}
                          title="Növbə (Waitlist)"
                        >
                          <Hourglass size={16} />
                          <span className="hidden sm:inline">Növbə</span>
                          {waitlistCount > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-black tabular-nums flex items-center justify-center leading-none">
                              {waitlistCount}
                            </span>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => router.push('/admin/reservations')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        title={t('reservations')}
                      >
                       <Calendar size={16} />
                       <span className="hidden sm:inline">{t('reservations')}</span>
                     </button>
                       <div className={`flex items-center gap-1 rounded-full p-1 ${lightMode ? 'bg-zinc-100' : 'bg-zinc-800'}`}>
                        {[
                          { active: !mergeMode && !transferMode, label: t('normal_mode') },
                          { active: mergeMode, label: t('merge') },
                          { active: transferMode, label: t('transfer') },
                        ].map(({ active, label }) => (
                          <button
                            key={label}
                            onClick={() => {
                              if (label === t('normal_mode')) { setMergeMode(false); setTransferMode(false); setSelectedForMerge([]); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); setActionSheetOpen(false); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                               if (label === t('merge')) { setMergeMode(true); setTransferMode(false); setSelectedForMerge([]); setTransferConfirm(false); setActionSheetOpen(false); setActionSheetTable(null); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                               if (label === t('transfer')) { setMergeMode(false); setTransferMode(true); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); setActionSheetOpen(false); setActionSheetTable(null); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                            }}
      className="relative px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] duration-200 z-10"
      style={{ color: active ? (lightMode ? '#ffffff' : '#000000') : lightMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)' }}
    >
       {active && (
         <AnimatePresence>
           <motion.div
             key={`action-pill-${label}`}
              layoutId="action-mode-pill-light"
              className={`absolute inset-0 rounded-full z-0 ${lightMode ? 'bg-zinc-900' : 'bg-white'}`}
                                   transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.4 }}
                                 />
                               </AnimatePresence>
                             )}
                            <span className="relative z-10">{label}</span>
                          </button>
                        ))}
                       </div>
                   </div>
                   </motion.div>
                )}
                </AnimatePresence>

                  {lastReservationArrival && (
                   <ReservationActionSheet
                     open={!!reservationArrival}
                     onClose={() => setReservationArrival(null)}
                     table={{
                       table_number: lastReservationArrival.table_number,
                       reservation_id: lastReservationArrival.reservation_id,
                       reservation_name: lastReservationArrival.name,
                       reservation_phone: lastReservationArrival.phone,
                       reservation_time: lastReservationArrival.time,
                        guest_count: lastReservationArrival.guests,
                        status: 'reserved',
                        is_vip: lastReservationArrival.is_vip,
                        deposit_amount: lastReservationArrival.deposit_amount ?? null,
                      }}
                      onGuestArrived={() => handleGuestArrived(lastReservationArrival)}
                     onEditReservation={() => {
                       setReservationArrival(null);
                       if (lastReservationArrival.reservation_id) {
                         router.push(`/admin/reservations?edit=${lastReservationArrival.reservation_id}`);
                       }
                     }}
                     onMoveTable={async () => {
                       setReservationArrival(null);
                       if (lastReservationArrival && lastReservationArrival.reservation_id) {
                         const targetTable = prompt(t('target_table_prompt'));
                         if (!targetTable) return;
                         const targetNum = parseInt(targetTable, 10);
                         if (isNaN(targetNum)) {
                           toast.error(t('invalid_table_number'));
                           return;
                         }
                         try {
                           const res = await apiFetch('/api/reservations/move-table', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({
                               reservation_id: lastReservationArrival.reservation_id,
                               from_table: lastReservationArrival.table_number,
                               to_table: targetNum,
                               terminal_id: pos.terminalId,
                             }),
                           });
                           if (res.ok) {
                              toast.success(t('table_transferred'));
                              pos.fetchData();
                            } else {
                              const err = await res.json().catch(() => ({ error: t('error') }));
                              toast.error(err.error || t('transfer_failed_short'));
                            }
                          } catch {
                            toast.error(t('transfer_failed_short'));
                         }
                       }
                     }}
                     onMergeTable={async () => {
                       setReservationArrival(null);
                       if (lastReservationArrival && lastReservationArrival.reservation_id) {
                          const extraTables = prompt(t('merge_tables_prompt'));
                         if (!extraTables) return;
                         const tableNums = extraTables.split(',').map((t) => parseInt(t.trim(), 10)).filter((n) => !isNaN(n));
                         if (tableNums.length === 0) {
                           toast.error(t('invalid_table_numbers'));
                           return;
                         }
                         tableNums.unshift(lastReservationArrival.table_number);
                         try {
                           const res = await apiFetch('/api/reservations/merge-tables', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({
                               reservation_id: lastReservationArrival.reservation_id,
                               table_numbers: tableNums,
                               terminal_id: pos.terminalId,
                             }),
                           });
                            if (res.ok) {
                              toast.success(t('tables_merged').replace('{tables}', tableNums.join(' + ')));
                              pos.fetchData();
                           } else {
                             const err = await res.json().catch(() => ({ error: t('error') }));
                             toast.error(err.error || t('merge_failed'));
                           }
                         } catch {
                           toast.error(t('merge_failed'));
                         }
                       }
                     }}
                     onCancelReservation={async () => {
                       setReservationArrival(null);
                       if (lastReservationArrival.reservation_id) {
                         try {
                           const res = await apiFetch('/api/reservations/cancel', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ reservation_id: lastReservationArrival.reservation_id, terminal_id: pos.terminalId }),
                           });
                           if (res.ok) {
                              toast.success(t('reservation_cancelled'));
                              pos.fetchData();
                            } else {
                              toast.error(t('cancel_failed'));
                            }
                          } catch {
                            toast.error(t('cancel_failed'));
                         }
                       }
                     }}
                     onMarkNoShow={async () => {
                       setReservationArrival(null);
                       if (lastReservationArrival.reservation_id) {
                         try {
                           const res = await apiFetch('/api/reservations/no-show', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ reservation_id: lastReservationArrival.reservation_id, terminal_id: pos.terminalId }),
                           });
                           if (res.ok) {
                              toast.success(t('no_show_recorded'));
                              pos.fetchData();
                            } else {
                              toast.error(t('no_show_failed'));
                            }
                          } catch {
                            toast.error(t('no_show_failed'));
                         }
                       }
                     }}
                     onPrintReservation={async () => {
                       setReservationArrival(null);
                       if (!lastReservationArrival?.reservation_id) return;
                       try {
                         const settings = await getReceiptSettings();
                         await printReservation({
                           restaurantName: settings.restaurantName,
                           address: settings.address,
                           receiptTitle: 'REZERVASİYA BİLETİ',
                           receiptCurrency: settings.receiptCurrency,
                           serviceFeePct: settings.serviceFeePct,
                           showServiceFee: false,
                           footerText: settings.footerText,
                           tableNumber: lastReservationArrival.table_number,
                           reservationId: lastReservationArrival.reservation_id,
                           guestName: lastReservationArrival.name || '',
                           phone: lastReservationArrival.phone || '',
                           guests: lastReservationArrival.guests || 0,
                           time: lastReservationArrival.time || '',
                           isVip: lastReservationArrival.is_vip || false,
                           paperWidth: settings.paperWidth,
                           copies: settings.copies,
                         });
                         toast.success(t('ticket_printed'));
                       } catch (e: any) {
                          toast.error(e.message || t('print_error'));
                       }
                     }}
                   />
                  )}
 
                 {/* Merge Preview — Apple-style summary card */}
                  {/* QF1: 2-table merge now auto-opens the sheet confirm bar;
                      this floating bar remains only for the 3+ table case. */}
                  {mergeMode && selectedForMerge.length >= 3 && (() => {
                   const mergeTables = selectedForMerge
                     .map(num => visibleTables?.find((t: any) => t.table_number === num) || { table_number: num, guest_count: 0, status: 'empty', total_amount: 0, kitchen_status: null })
                     .filter(Boolean);
                   const parentTable = mergeTables[0];
                   const childTables = mergeTables.slice(1);
                   const totalGuests = mergeTables.reduce((s: number, t: any) => s + (t.guest_count || 0), 0);
                   const orderCount = mergeTables.filter((t: any) => ['occupied', 'cooking', 'waiting_bill', 'waiting'].includes(t.status)).length;
                   return (
                     <AnimatePresence>
                        <motion.div
                          key="merge-preview"
                          initial={{ opacity: 0, y: -8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                           exit={{ opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
                           transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                          className="flex-shrink-0 mb-4"
                        >
                           <div className={`flex items-center gap-3 px-4 py-3 rounded-4xl border shadow-lg ${lightMode ? 'bg-white border-zinc-200' : 'bg-[var(--theme-surface)] border-[var(--theme-border)]'}`}>
                             <Users size={16} className="text-[var(--theme-accent)] shrink-0" />
                             <div className="flex flex-col flex-1 min-w-0">
                               <p className="text-xs uppercase tracking-widest font-black text-[var(--theme-text-secondary)] mb-0.5">
                                 {t('merge_preview')}
                               </p>
                               <p className="text-sm font-black text-[var(--theme-text)]">
                                 <span>{t('table_number')} {parentTable.table_number}</span>
                                 {childTables.map((t: any) => ` + ${t.table_number}`)}
                                 <span className="mx-2">·</span>
                                 <span className="text-[var(--theme-accent)]">{totalGuests} {t('guests')}</span>
                                 <span className="mx-2">·</span>
                                 <span className="text-[var(--theme-text-secondary)]">{orderCount} {t('orders')}</span>
                               </p>
                             </div>
                             {/* M1 fix: confirm was unreachable in floor-tap merge flow
                                 (ActionSheet merge bar only renders when sheet is open).
                                 Opens the existing PIN-guarded merge confirm bar. */}
                             <div className="flex items-center gap-2 shrink-0">
                               <button
                                 onClick={() => { setMergeMode(false); setSelectedForMerge([]); }}
                                 className="px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95"
                                 style={{ borderColor: lightMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', color: lightMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}
                               >
                                 {t('cancel')}
                               </button>
                               <button
                                 onClick={() => setActionSheetOpen(true)}
                                 className="px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-zinc-900 text-white shadow-lg active:scale-95 transition-all"
                               >
                                 {t('merge_confirm')}
                               </button>
                             </div>
                           </div>
                       </motion.div>
                     </AnimatePresence>
                   );
                 })()}
 
                  <div className="flex-1 overflow-y-auto overscroll-contain">
                    {pos.floorLoadFailed ? (
                      <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 p-8">
                         {/* 2026-09-28 (owner: light mode — yalnız mavi/qara) */}
                         <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-900/10 text-zinc-900' : 'bg-amber-500/10 text-amber-400'}`}>
                          <AlertTriangle size={28} strokeWidth={2} />
                        </div>
                        <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>{t('floors_load_failed')}</p>
                        <button
                          onClick={() => pos.fetchData()}
                          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}
                        >
                          <RefreshCw size={14} />
                          {t('retry')}
                        </button>
                      </div>
                    ) : pos.floors.length === 0 ? (
                      <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 p-8">
                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/30'}`}>
                          <Table2 size={28} strokeWidth={1.8} />
                        </div>
                        <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('no_floors_configured')}</p>
                        <button
                          onClick={() => pos.fetchData()}
                          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}
                        >
                          <RefreshCw size={14} />
                          {t('retry')}
                        </button>
                      </div>
                    ) : (activeFloor?.tables?.length ?? 0) === 0 ? (
                      <div className="min-h-full flex flex-col items-center justify-center text-center gap-4 p-8">
                        <div className={`w-14 h-14 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/30'}`}>
                          <Table2 size={24} strokeWidth={1.8} />
                        </div>
                        <p className={`text-sm font-black uppercase tracking-widest max-w-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('no_tables_on_floor')}</p>
                      </div>
                    ) : (
                    <AnimatePresence mode="wait">
                  <motion.div
                     key={`tables-${selectedFloor || 'default'}`}
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     transition={fastExit}
                   >
                  {/* Motion System (2026-09-27): the grid is ALIVE — a table
                      that leaves (floor-plan change / unmerge) collapses and
                      its neighbors GLIDE into the gap (framer layout). */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <AnimatePresence>
                    {visibleTables?.map((table: any, _tableIdx: number) => {
                      const groupInfo = tableGroupInfo[table.table_number];
                      const isGroup = groupInfo && groupInfo.children.length > 0;

                      return (
                        <GridCell
                          key={`tbl-${table.table_number ?? table.id ?? _tableIdx}`}
                          className="col-span-1"
                        >
                        <TableCard 
                          table={table}
                          onTap={() => handleTableTap(table)}
                          onAction={() => handleOpenAction(table)}
                          onToggleBill={() => table.bill_requested && handleBillRequest(table.table_number, false)}
                         isSelected={selectedForMerge.includes(table.table_number)}
                         selectionMode={mergeMode}
                         isTransferSource={transferSource === table.table_number}
                         isTransferTarget={transferTarget === table.table_number}
                         groupNumber={groupInfo?.groupNum}
                         mergedChildNumbers={groupInfo?.children}
                         isMergedChild={false}
                         kitchenStatus={table.kitchen_status}
                         flashNonce={flashInfo?.tableNumber === table.table_number ? (flashInfo?.nonce ?? 0) : 0}
                         tapPulseNonce={tableTapPulse && tableTapPulse.tableNumber === table.table_number ? tableTapPulse.nonce : 0}
                        />
                        </GridCell>
                      );
                    })}
                    </AnimatePresence>
                  </div>
                  </motion.div>
                   </AnimatePresence>
                    )}
                  </div>
              </motion.div>
            )}

            {/* TAKEAWAY: Active orders list */}
            {posMode === 'takeaway' && pos.activeView === 'floor' && (
               <motion.div
                  key="takeaway-wrapper"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fastExit}
               >
              <TakeawayOrders
                key="takeaway-list"
                orders={takeawayOrders}
                onRefresh={fetchTakeawayOrders}
                 onNewOrder={() => {
                   pos.initializeTakeawayCart();
                   setEditingOrder(null);
                   setPosPhase('products'); setCustomerFocus(null);;
                   pos.setActiveView('order');
                 }}
                 onSelectOrder={(order) => {
                   setEditingOrder(order);
                   setPosPhase('products'); setCustomerFocus(null);;
                   pos.loadOrderIntoCart(order);
                   pos.setActiveView('order');
                 }}
                onOpenActionSheet={handleOpenOrderSheet}
              />
              </motion.div>
            )}

            {/* DELIVERY: Active orders list */}
           {posMode === 'delivery' && pos.activeView === 'floor' && (
               <motion.div
                  key="delivery-wrapper"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fastExit}
                >
               <DeliveryOrders
                 key="delivery-list"
                orders={deliveryOrders}
                onRefresh={fetchDeliveryOrders}
                 onNewOrder={() => {
                   pos.initializeTakeawayCart();
                   setEditingOrder(null);
                   setPosPhase('products'); setCustomerFocus(null);;
                   pos.setActiveView('order');
                 }}
                 onSelectOrder={(order) => {
                   setEditingOrder(order);
                   setPosPhase('products'); setCustomerFocus(null);;
                   pos.loadOrderIntoCart(order);
                   pos.setActiveView('order');
                 }}
                onOpenActionSheet={handleOpenOrderSheet}
              />
              </motion.div>
            )}

           {/* ORDER VIEW: ProductGrid + CartPanel — works for ALL modes */}
           {pos.activeView === 'order' && pos.loading && (
             <div key="order-skeleton" className="h-full w-full flex flex-col md:flex-row overflow-hidden">
                <div className="flex-1 p-6 overflow-hidden"><ProductGridSkeleton /></div>
                <div className="w-full md:w-[400px] border-l p-6 bg-black/20"><CartSkeleton /></div>
             </div>
           )}
             {pos.activeView === 'order' && !pos.loading && (
                <motion.div
                  key="order"
                  className="h-full w-full flex flex-col overflow-hidden"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={fastExit}
                >
                   {/* ═══════════════════════════════════════════════ */}
                   {/* SİFARİŞ — ProductGrid + CartPanel                */}
                   {/* ═══════════════════════════════════════════════ */}
                     <div className="flex-1 flex flex-row overflow-hidden min-h-0">
                      {/* Owner fix (2026-09-22): the wrapper used to scroll the
                          WHOLE block (search + filter tabs + categories + grid),
                          so Hamısı/Son/Məşur "disappeared" as soon as the grid
                          scrolled. Now the wrapper is fixed and only the grid
                          inside ProductGrid scrolls (it already has its own
                          overflow-y-auto) — search + tabs + categories stay
                          pinned. */}
                      <div className="flex-1 p-6 min-h-0 overflow-hidden">
                        <AnimatePresence mode="wait">
                          {posPhase === 'customer' && posMode !== 'dine_in' ? (
                            <motion.div
                              key="customer-phase"
                              className="h-full"
                              initial={{ opacity: 0, y: 14, scale: 0.99 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              // 2026-09-27 (owner: "giriş animasiyasını qoruyaraq
                              // çıxışda həmin animasiyanı tərsinə tətbiq et"):
                              // exit is the EXACT REVERSE of the enter — the pane
                              // recedes along the same trajectory it entered
                              // (y 0→14, scale 1→0.99), never the old y:-10
                              // "up-and-away" that read as a jump.
                              exit={{ opacity: 0, y: 14, scale: 0.99 }}
                              transition={SPRING}
                            >
                              <CustomerPhasePanel
                                mode={posMode}
                                cart={pos.cart}
                                zones={deliveryZones}
                                onUpdate={(field, value) => {
                                  if (!pos.cart) return;
                                  const next = { ...pos.cart, [field]: value };
                                  pos.setCart(next);
                                  if (posMode !== 'delivery') return;
                                  // 2026-09-26 (owner, Task 50, Wolt-style): the
                                  // MOMENT the address is typed and no zone is
                                  // selected → auto-commit the top-priority
                                  // active zone and price the fee immediately
                                  // (previously the fee only appeared after a
                                  // manual zone-chip click; the recalc effect
                                  // also skips EMPTY carts, so call it here).
                                  if (field === 'delivery_address' && String(value || '').trim() && !next.delivery_zone && !(Number(next.delivery_km) >= 0.1)) {
                                    const z = [...deliveryZones].sort((a: any, b: any) => (a.priority ?? 999) - (b.priority ?? 999))[0];
                                    if (z) {
                                      const withZone = { ...next, delivery_zone: z.name };
                                      pos.setCart(withZone);
                                      recalcDeliveryFee(withZone, z.name);
                                    }
                                  } else if (field === 'delivery_km' && Number(value) >= 0.1 && next.delivery_zone) {
                                    // KM typed → distance overload re-prices.
                                    recalcDeliveryFee(next, next.delivery_zone);
                                  }
                                }}
                                onZoneSelect={handleZoneSelect}
                                onBack={() => { setPosPhase('products'); setCustomerFocus(null); }}
                                focusField={customerFocus}
                                deliveryPaused={deliveryGates.accepting === false}
                                deliveryMinOrder={deliveryGates.minOrder}
                                feeCalculating={deliveryFeeCalculating}
                                surge={deliverySurge}
                              />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="products-phase"
                              className="h-full"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              // 2026-09-27 (owner: same reversed-trajectory rule
                              // as the customer phase above) — products recede
                              // back the way they came (y 0→10), so the
                              // Products ⇄ Customer Info swap reads as one
                              // continuous path in both directions.
                              exit={{ opacity: 0, y: 10 }}
                              transition={SPRING}
                            >
                            <ProductGrid
                           ref={gridRef}
                           products={pos.products}
                           categories={pos.categories}
                           combos={pos.combos}
                           variantsByProduct={pos.variantsByProduct}
                            onAddProduct={(p) => handleProductTap(p)}
                            // 2026-09-28 (owner: collapse + pill tabs): the
                            // multi-instance editor saves ALL instances in ONE
                            // atomic setCart (applyInstanceEdits) — sequential
                            // per-line addToCart calls would lose replacements.
                            onApplyInstanceEdits={(product, edits) => pos.applyInstanceEdits(product, edits as any)}
                            onAddCombo={(c) => pos.addComboToCart(c)}
                           cartCounts={posCartCounts}
                             outOfStock={outOfStockSet}
                             // 2026-09-27 (owner): MƏTBƏX popup — SELECTED TABLE
                             // state ONLY (no more all-orders section). null while
                             // no cart is bound → the popover shows "Sifariş
                             // seçilməyib" instead of fake zeros.
                             currentTableKitchen={pos.cart ? (() => {
                               const items = pos.cart?.items ?? [];
                               const sent = items.filter((i: any) => (i.sentQuantity ?? 0) > 0);
                               const label = posMode === 'dine_in'
                                 ? (pos.cart?.table_number ? `Masa ${pos.cart.table_number}` : (t('order_history') || 'Sifariş'))
                                 : posMode === 'takeaway' ? 'Takeaway' : 'Çatdırılma';
                               return {
                                 label,
                                 draft: items.reduce((s: number, i: any) => s + Math.max(0, (i.quantity ?? 0) - (i.sentQuantity ?? 0)), 0),
                                 prep: sent.filter((i: any) => ['pending', 'accepted', 'sent', 'preparing'].includes(i.kitchen_status || 'pending')).length,
                                 ready: sent.filter((i: any) => ['ready', 'served'].includes(i.kitchen_status || '')).length,
                               };
                             })() : null}
                            catalogError={pos.catalogLoadFailed}
                            onRetryCatalog={() => pos.fetchData()}
                            filterData={filterData}
                           />
                            </motion.div>
                          )}
                        </AnimatePresence>
                       </div>
                         {/* 2026-09-26 (Task 55, audit55 P0 "şəkil 4"): the customer
                             phase used to hide the 440px cart column.
                             2026-09-27 (owner OVERRIDE: "Customer Info açıldıqda
                             səbət yoxa çıxmasın — keçid zamanı görünən qalsın"):
                             the cart stays MOUNTED and visible through the whole
                             Products ⇄ Customer Info swap — no content loss, no
                             column collapse, no UI jump. The phase pane keeps
                             flex-1; the cart keeps its fixed 440px. */}
                         <div
                            className="w-[440px] flex-shrink-0 border-l flex flex-col overflow-hidden min-h-0"
                           >
                                {/* 2026-09-23 (owner): the wide blue binding banner is
                                    REJECTED — it ate the whole cart column top. The
                                    binding identity now lives as a compact chip inside
                                    the CartPanel header (boundOrderLabel prop). */}
                        <CartPanel
                          cart={pos.cart}
                          cartHydrating={pos.cartHydrating}
                          vatEnabled={vatEnabled}
                          onPlaceOrder={sendCurrentOrder}
                            onBack={() => {
                              // Owner UX (2026-09-21): exiting the cart keeps
                              // the items as a DRAFT — no guard modal, nothing
                              // is discarded. Drafts are carried when the same
                              // table is reopened (selectTable carryDrafts).
                              if (pos.placingOrder) return;
                               pos.exitReservationMode(); setReservationMode(false); setReservationId(null); setReservationGuest(null);
                               pos.setActiveView('floor'); setEditingOrder(null); setPosPhase('products'); setCustomerFocus(null);;
                            }}
                         orderButtonStatus={pos.placingOrder ? 'loading' : 'idle'}
                         onUpdateQty={(idx, delta) => pos.updateCartItemQty(idx, delta)}
                          onEditGuestCount={() => { setActionSheetOpen(true); }}
                          onGuestCountSaved={(count) => {
                              // 2026-09-27 (owner: guest confirm slow) — OPTIMISTIC: the cart
                              // chip updates INSTANTLY on the tap. No heavy pos.fetchData()
                              // fan-out here (that was the delay); the floor card refreshes
                              // only after the POST commits (onGuestCountPersisted).
                              if (pos.cart) pos.setCart({ ...pos.cart, guest_count: count });
                            }}
                          onGuestCountPersisted={() => pos.fetchFloor()}
                          onUpdateCustomer={(name) => pos.updateCartCustomer(pos.cart?.customer_id || null, name)}
                          onSelectCustomer={handleSelectCustomer}
                           onOpenCustomerPhase={() => {
                             // 2026-09-25 (owner, partner Part 1): partner order
                             // customer info is API-sourced (partner app) — the
                             // customer phase (name/phone/zone/address inputs)
                             // is BLOCKED for partner orders. In-house only.
                             if ((editingOrder as any)?.partner_source) return;
                             setPosPhase('customer'); setCustomerFocus(null);
                           }}
                            partnerSource={(editingOrder as any)?.partner_source || null}
                            partnerOrder={(editingOrder as any)?.partner_source ? (editingOrder as any) : null}
                            feeCalculating={deliveryFeeCalculating}
                           onRecordLoss={handleRecordLoss}
                         onClearDraft={() => pos.clearCart()}
                         mergedChildNumbers={posMode === 'dine_in' ? activeFloor?.merged_groups?.find((g: any) => g.parent.table_number === pos.selectedTable?.table_number)?.children?.map((c: any) => c.table_number) : undefined}
                         customerId={pos.cart?.customer_id}
                         customerName={pos.cart?.customer_name}
                         isReservationMode={pos.reservationMode}
                         reservation={pos.reservationInfo}
                         reservationPreOrderItems={pos.reservationPreOrderItems}
                         onGuestArrived={pos.guestArrived}
                           onUpdateItem={(idx, patch) => {
                            if (!pos.cart) return;
                            const newItems = [...pos.cart.items];
                            newItems[idx] = { ...newItems[idx], ...patch };
                            pos.setCart({ ...pos.cart, items: newItems });
                          }}
                           onUpdateItems={(patches) => {
                            // Batched (single setCart) — the collapsed group's
                            // hold-toggle rewrites several instances at once.
                            if (!pos.cart) return;
                            const newItems = [...pos.cart.items];
                            for (const { idx, patch } of patches) {
                              if (newItems[idx]) newItems[idx] = { ...newItems[idx], ...patch };
                            }
                            pos.setCart({ ...pos.cart, items: newItems });
                          }}
                          onUpdateOrderType={(type) => pos.updateOrderType(type)}
                          posMode={posMode}
                          tableStatus={pos.selectedTable?.status ?? null}
                          tableGuests={pos.cart?.guest_count ?? pos.selectedTable?.guest_count ?? null}
                          onSeatTable={async () => {
                            const tbl = pos.selectedTable;
                            if (!tbl) return;
                            const guests = pos.cart?.guest_count || tbl.guest_count || 1;
                            await pos.seatTable(tbl.table_number, guests);
                            if (pos.cart && !pos.cart.guest_count) pos.setCart({ ...pos.cart, guest_count: guests });
                          }}
                          onOpenActions={() => {
                            if (!pos.selectedTable) return;
                            playHapticSound('on');
                            setActionSheetTable(pos.selectedTable);
                            setActionSheetOpen(true);
                          }}
                          isDirty={(pos.cart?.items ?? []).some(i => (i.sentQuantity ?? 0) === 0 && i.quantity > 0)}
                          onVoidSuccess={() => {
                            if (pos.selectedTable) {
                              pos.selectTable(pos.selectedTable, { force: true });
                            }
                          }}
                          onUpdateDeliveryFields={(fields) => {
                           if (!pos.cart) return;
                           pos.setCart({ ...pos.cart, ...fields });
                         }}
                          onUpdateGlobalNote={(note) => {
                            if (!pos.cart) return;
                            pos.setCart({ ...pos.cart, notes: note });
                          }}

                           onCouponApplied={(c) => {
                             if (!pos.cart) return;
                             pos.setCart({ ...pos.cart, coupon: c });
                           }}
                            onCouponRemoved={() => {
                              if (!pos.cart) return;
                              pos.setCart({ ...pos.cart, coupon: null });
                            }}
                            onOpenModifiers={(productId) => {
                             const product = pos.products.find((p: any) => p.id === productId);
                             if (product) gridRef.current?.openEditor(productId);
                           }}
                             onRequestEditor={(productId, lineIndexes, lineItems) => {
                               const items = (pos.cart?.items || []) as any[];
                               // 2026-09-28 (owner: collapse + TikTok-style pill
                               // tabs): CartPanel sends the WHOLE group (all
                               // line indexes of product+variant). The editor
                               // opens in multi-instance mode — one pill tab per
                               // instance with a hint label ("1 · Kremli").
                               // Fallback (legacy single index / no match) =
                               // plain add editor.
                               const idxs: number[] = Array.isArray(lineIndexes)
                                 ? lineIndexes
                                 : typeof lineIndexes === 'number' ? [lineIndexes] : [];
                               const lines = idxs
                                 .map(i => items[i])
                                 .filter(it => it && String(it.product_id) === String(productId) && !it.__isCombo && !it.is_combo);
                               if (lines.length === 0) {
                                 gridRef.current?.toggleEditor(productId);
                                 return;
                               }
                               const product = pos.products.find((p: any) => p.id === productId) as any;
                               const groups: any[] = product?.modifier_groups || [];
                               const hintFor = (match: any): string => {
                                 const mods: any[] = match.modifiers || [];
                                 if (mods.length === 0) return '';
                                 // Exclusive (max_select=1) group's chosen member
                                 // is the meaningful label ("Kremli"); else the
                                 // first added modifier ("Losos").
                                 const excl = groups.find((g: any) =>
                                   Number(g.max_select) === 1 &&
                                   Array.isArray(g.item_ids) &&
                                   g.item_ids.some((id: string) => mods.some(m => m.id === id)));
                                 if (excl) {
                                   const m = mods.find(m => (excl.item_ids as string[]).includes(m.id));
                                   if (m) return m.name || '';
                                 }
                                 return mods[0].name || '';
                               };
                               const instances = lines.map((match, i) => ({
                                 lineIndex: idxs[i],
                                 quantity: match.quantity || 1,
                                 modifiers: (match.modifiers || []).reduce((acc: Record<string, number>, m: any) => {
                                   acc[m.id] = (acc[m.id] || 0) + (m.quantity || 1);
                                   return acc;
                                 }, {} as Record<string, number>),
                                 variantId: match.variant_id ?? null,
                                 note: match.special_notes || '',
                                 course: match.course ?? null,
                                 is_hold: !!(match.is_hold || match.hold_until),
                                 allergens: Array.isArray(match.allergens) ? match.allergens : [],
                                 // 2026-09-28 (owner): served/completed instance
                                 // → its pill opens LOCKED (spec read-only).
                                 kitchen_status: match.kitchen_status ?? null,
                                 sentQuantity: match.sentQuantity ?? 0,
                                 hint: hintFor(match),
                                 // 2026-09-24 (owner, FINAL): return lives in the
                                 // details panel — only served instances carry
                                 // the context (served portion only).
                                 returnCtx: (match?.sentQuantity ?? 0) > 0 && ['ready', 'completed', 'served'].includes(match?.kitchen_status || 'pending')
                                   ? {
                                       order_item_id: match.id,
                                       product_name: match.product_name,
                                       quantity: Math.min(match.quantity || 1, match.sentQuantity || 1),
                                       unit_price: Number(match.unit_price) || 0,
                                     }
                                   : undefined,
                               }));
                               gridRef.current?.toggleEditor(productId, { instances });
                             }}
                            />
                       </div>
                     </div>
                </motion.div>
            )}
            </AnimatePresence>

            <ActionSheet
            table={(() => {
              if (!actionSheetTable) return actionSheetTable;
              // S1 snapshot-drift fix: the floor list (pos.floors) is refreshed on
              // every poll/realtime; the sheet should show LIVE totals/status, not
              // the stale snapshot captured when it opened.
              const live = (pos.floors || []).flatMap((f: any) => f.tables || []).find((t: any) => t.table_number === actionSheetTable.table_number);
              return (live && live.table_number === actionSheetTable.table_number) ? live : actionSheetTable;
            })()}
            open={actionSheetOpen || paymentView} 
            onClose={() => { playHapticSound('off'); setActionSheetOpen(false); setUnmergeMode(false); setPaymentView(false); setTransferMode(false); setTransferSource(null); setTransferTarget(null); }} 
           onAddOrder={() => { if (actionSheetTable?.table_number && ['occupied', 'cooking', 'waiting_bill', 'waiting'].includes(actionSheetTable.status)) { setFlashInfo({ tableNumber: actionSheetTable.table_number, nonce: Date.now() }); } pos.selectTable(actionSheetTable); setActionSheetOpen(false); }}
           onSeatGuests={() => {
             if (actionSheetTable?.reservation_id) {
               setActionSheetOpen(false);
               handleGuestArrived({
                 table_number: actionSheetTable.table_number,
                 reservation_id: actionSheetTable.reservation_id,
                 name: actionSheetTable.reservation_name || null,
                 guests: actionSheetTable.guest_count || 1,
               });
             }
           }}
          onUnmerge={() => setUnmergeMode(true)}
          onOpenPayment={handleOpenPayment}
          onPaymentMethodSelect={handlePaymentMethodSelect}
          onSplitConfirm={handleSplitConfirm}
           onBackFromPayment={handleBackFromPayment}
             onMarkServed={handleMarkServed}
             onDiscount={() => setDiscountOpen(true)}
           onCancelTable={async () => {
             if (!actionSheetTable) return;
             if (posMode === 'takeaway' || posMode === 'delivery') {
               setActionSheetOpen(false);
               if (posMode === 'delivery') {
                 await orderStateMachine.transitionDelivery(actionSheetTable.id, 'cancelled');
               } else {
                 await orderStateMachine.transition(actionSheetTable.id, 'cancelled');
               }
              } else {
                // QF3: dine-in "MASANI BOŞALT" on an occupied table is
                // destructive (cancels the order) — manager-PIN gate first.
                setClearPinTable({ num: actionSheetTable.table_number, mode: 'dismiss' });
              }
            }}
           onReleaseTable={async () => {
             if (!actionSheetTable) return;
             const res = await pos.releaseTable(actionSheetTable.table_number);
             if (res.ok) setActionSheetOpen(false);
           }}
         onDismissGroup={() => {
            if (!actionSheetTable) return;
            // PIN-gated group clear (unmerge children + dismiss each).
            setClearPinTable({
              num: actionSheetTable.table_number,
              mode: 'group',
              children: tableGroupInfo[actionSheetTable.table_number]?.children || [],
            });
          }}
          paymentView={paymentView}
          mergeMode={mergeMode}
          transferMode={transferMode}
          mergeParent={selectedForMerge[0]}
         unmergeMode={unmergeMode}
         isMerged={!!actionSheetGroup}
         mergedGroupChildren={actionSheetGroup?.children}
         selectedForMerge={selectedForMerge}
         selectedForUnmerge={selectedForUnmerge}
         onToggleUnmerge={(n) => {
           if (selectedForUnmerge.includes(n)) setSelectedForUnmerge(p => p.filter(x => x !== n));
           else setSelectedForUnmerge(p => [...p, n]);
         }}
         onConfirmUnmerge={handleUnmerge}
         onCancelMode={() => { setMergeMode(false); setTransferMode(false); setUnmergeMode(false); setSelectedForMerge([]); setSelectedForUnmerge([]); setTransferSource(null); setTransferTarget(null); }}
             onConfirmMerge={async () => { 
              const parentTableNumber = selectedForMerge[0];
              const childTableNumbers = selectedForMerge.slice(1);
              const undoResult = await pos.mergeTables(selectedForMerge); 
              if (undoResult) setLastUndo({ ...undoResult, timestamp: Date.now() });
              setTimeout(() => setLastUndo(null), 5000);
              if (pos.selectedTable && childTableNumbers.includes(pos.selectedTable.table_number)) {
                pos.resetCart();
                const freshFloorsRes = await apiFetch('/api/pos/tables');
                const freshFloors = freshFloorsRes.ok ? (await freshFloorsRes.json()).floors || [] : pos.floors;
                const allTables = freshFloors.flatMap((f: any) => f.tables || []);
                const parentTable = allTables.find((t: any) => t.table_number === parentTableNumber);
                if (parentTable) pos.selectTable(parentTable);
              }
              setMergeMode(false); 
              setSelectedForMerge([]); 
              setActionSheetOpen(false);
            }}
          onBillRequest={handleBillRequest}
          onPrintBill={handlePrintBill}
            onClearTable={() => {
              // QF3: open the manager-PIN gate first; the destructive clear
              // runs only after the PIN is verified server-side.
              if (actionSheetTable) setClearPinTable({ num: actionSheetTable.table_number, mode: 'clear' });
            }}
          posRole={posRole}
            groupNumber={actionSheetTable ? tableGroupInfo[actionSheetTable.table_number]?.groupNum : undefined}
             customerId={pos.cart?.customer_id}
            customerName={pos.cart?.customer_name}
             onSelectCustomer={handleSelectCustomer}
            onLoyaltyRedeemed={() => {
              // Redeem changed the order total server-side (v3 recompute) —
              // refresh floor data + reconcile the sheet's order from server.
              pos.fetchData();
              const oid = actionSheetTable?.current_order_id || actionSheetTable?.orders?.[0]?.id;
              if (oid) void reconcileOrderFromServer(oid);
            }}
            posMode={posMode}
            transferConfirm={transferConfirm}
            transferSource={transferSource}
            transferTarget={transferTarget}
             onConfirmTransfer={() => { if (transferTarget) handleConfirmTransfer(transferTarget); setTransferConfirm(false); setActionSheetOpen(false); }}
             onCancelTransfer={() => { setTransferConfirm(false); setTransferMode(false); setTransferSource(null); setTransferTarget(null); }}
             courierPickerOpen={courierPickerOpen}
             couriers={couriers}
             couriersLoading={couriersLoading}
             onOpenCourierPicker={handleOpenCourierPicker}
             onAssignCourier={handleAssignCourier}
             onCloseCourierPicker={() => setCourierPickerOpen(false)}
             hasCourier={!!actionSheetTable?.courier_id}
             courierStatusOpen={courierStatusOpen}
             courierStatusTransitions={courierStatusTransitions}
             courierStatusLoading={courierStatusLoading}
             onOpenCourierStatus={handleOpenCourierStatus}
             onSelectCourierTransition={handleSelectCourierTransition}
             onCloseCourierStatus={() => setCourierStatusOpen(false)}
           />

      <CashDrawerPanel
        open={cashDrawerOpen}
        onClose={() => setCashDrawerOpen(false)}
        onClockIn={handleClockIn}
      />

      {/* 2026-09-24 (owner: "tam məlumat ver — hansı terminaldı, self-ordermı,
          KDS/BDS-mi"): full second-writer conflict dialog. Shows WHICH channel
          modified the order, the terminal id, when, and the last operation. */}
      {pos.conflictInfo && (() => {
        const ci: any = pos.conflictInfo;
        const channelMeta = (() => {
          switch (ci.channel) {
            // 2026-09-28 (owner: light mode — yalnız mavi/qara, orange+sarı YOX)
            case 'kds': return { label: t('conflict_channel_kds'), cls: lightMode ? 'bg-zinc-900/10 text-zinc-900 border-zinc-900/25' : 'bg-amber-500/15 text-amber-500 border-amber-500/30' };
            case 'system_or_qr': return { label: t('conflict_channel_qr'), cls: lightMode ? 'bg-blue-500/10 text-blue-600 border-blue-500/30' : 'bg-blue-500/15 text-blue-500 border-blue-500/30' };
            case 'pos_other_terminal': return { label: t('conflict_channel_other_pos'), cls: lightMode ? 'bg-rose-500/10 text-rose-600 border-rose-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30' };
            case 'pos_same_terminal': return { label: t('conflict_channel_own_tab'), cls: lightMode ? 'bg-violet-500/10 text-violet-700 border-violet-500/30' : 'bg-violet-500/15 text-violet-500 border-violet-500/30' };
            case 'other_location': return { label: t('conflict_channel_other_location'), cls: lightMode ? 'bg-zinc-900/10 text-zinc-900 border-zinc-900/25' : 'bg-orange-500/15 text-orange-400 border-orange-500/30' };
            default: return { label: t('conflict_no_channel'), cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' };
          }
        })();
        const bodyTxt = ci.channel === 'other_location' ? t('conflict_other_location_body') : t('conflict_body');
        const whenTxt = ci.last_writer_at ? new Date(ci.last_writer_at).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
        const lastOpTxt = ci.last_op ? `${ci.last_op.action}${ci.last_op.employee ? ' · ' + ci.last_op.employee : ''}` : '—';
        const Row = ({ k, v, mono }: { k: string; v: any; mono?: boolean }) => (
          <div className="flex items-start justify-between gap-3 py-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)] shrink-0">{k}</span>
            <span className={`text-xs font-bold text-right break-all ${mono ? 'tabular-nums' : ''}`}>{v}</span>
          </div>
        );
        return (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-[140] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => pos.setConflictInfo(null)} />
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }}
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={22} className="text-red-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black uppercase tracking-tight">{t('conflict_title')}</h3>
                  <div className={`inline-flex mt-1.5 items-center px-2.5 py-1 rounded-lg border text-[11px] font-black uppercase tracking-wide ${channelMeta.cls}`}>
                    {channelMeta.label}
                  </div>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-white/55 mb-4">{bodyTxt}</p>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 divide-y divide-white/5 mb-5">
                <Row k={t('table')} v={ci.table_number ?? '—'} />
                <Row k={t('conflict_wrote')} v={ci.last_writer_terminal || t('conflict_no_channel')} mono />
                <Row k={t('conflict_when')} v={whenTxt} mono />
                <Row k={t('conflict_last_op')} v={lastOpTxt} />
                <Row k={t('conflict_terminal')} v={ci.own_terminal || '—'} mono />
                <Row k={t('conflict_version')} v={ci.current_version ?? '—'} mono />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => pos.setConflictInfo(null)}
                  className="flex-1 py-3 rounded-2xl border border-white/10 text-white/50 text-xs font-black uppercase tracking-wider hover:bg-white/5"
                >
                  {t('close')}
                </button>
                <button
                  onClick={() => { pos.setConflictInfo(null); pos.fetchData?.().catch?.(() => {}); }}
                  className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-600 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} /> {t('conflict_refresh')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        );
      })()}

      <OrderHistory
        open={orderHistoryOpen}
        onClose={() => setOrderHistoryOpen(false)}
        posRole={posRole}
      />

      {/* 2026-09-25 (owner: "waitlist duzelt"): dine-in guest queue */}
      <WaitlistPanel
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        emptyTables={emptyTables}
        onSeated={() => { pos.fetchData(); }}
      />

      <AnimatePresence>
        {lastUndo && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} transition={fastExit}             className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-6 px-8 py-4 rounded-5xl bg-zinc-900 text-white shadow-elevated border border-white/10">
            <span className="text-sm font-bold">{lastUndo.message}</span>
            <button onClick={handleUndo} className="px-6 py-2.5 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95">{t('undo')}</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receiptView && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={appleBackdrop}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
            onClick={() => { setReceiptView(null); setReceiptTendered(undefined); }}
          >
            <motion.div
              {...slideUp}
              className="bg-white rounded-3xl shadow-elevated max-h-[90vh] overflow-auto max-w-xs w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Success checkmark header */}
              <div className="px-4 pt-5 pb-3 text-center">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.15 }}
                  className="mx-auto mb-2 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <motion.polyline
                      points="20 6 9 17 4 12"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }}
                    />
                  </svg>
                </motion.div>
                 {/* 2026-09-28 (owner: light mode — yalnız mavi/qara): pending = qara */}
                 <h2 className={`text-sm font-black tracking-tight uppercase ${payOfflinePending ? 'text-zinc-900' : 'text-emerald-600'}`}>
                   {payOfflinePending ? 'Sifariş qeydə alındı — sinxron olacaq' : `${t('order_paid')} ✓`}
                 </h2>
                 {payOfflinePending && (
                   <div className="mt-2 mx-auto max-w-[240px] text-center text-[10px] font-bold uppercase tracking-wider text-zinc-900 bg-zinc-900/10 border border-zinc-900/25 rounded-lg px-2.5 py-1.5">
                     Offline ödəniş · internet qayıtda avtomatik yüklənəcək
                   </div>
                 )}
                {(receiptView.staffName || receiptView.paymentMethodName) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="flex items-center justify-center gap-3 mt-2 text-[11px] text-zinc-500"
                  >
                    {receiptView.staffName && <span>{receiptView.staffName}</span>}
                    {receiptView.staffName && receiptView.paymentMethodName && <span>·</span>}
                    {receiptView.paymentMethodName && <span>{receiptView.paymentMethodName}</span>}
                  </motion.div>
                )}
              </div>

              {/* Inline receipt items */}
              <div className="px-3 pb-3">
                 <ReceiptPreview
                   title={receiptView.receiptTitle || 'SİFARİŞ ÇEKİ'}
                   tableNumber={receiptView.tableNumber}
                   items={receiptView.items}
                   showServiceFee={false}
                   serviceFeePct={0}
                   currency="₼"
                   discountAmount={receiptView.discount}
                   campaignName={receiptView.discountName || undefined}
                   transparent
                   date={receiptView.paymentDate}
                   time={receiptView.paymentTime}
                   vatAmount={receiptView.taxAmount ?? null}
                   vatPct={receiptView.taxPct ?? 0}
                   paymentMethodLabel={receiptView.paymentMethodName || (receiptView.paymentMethod === 'cash' ? 'Nağd' : receiptView.paymentMethod === 'card' ? 'Kart' : receiptView.paymentMethod === 'gift_card' ? 'Hediye Kartı' : receiptView.paymentMethod === 'split' ? 'Bölünmüş' : receiptView.paymentMethod || undefined)}
                   orderTypeLabel={receiptView.orderType === 'takeaway' ? 'Gel-Al' : receiptView.orderType === 'delivery' ? 'Çatdırılma' : undefined}
                   orderRef={receiptView.orderType && receiptView.orderType !== 'dine_in' && receiptView.orderId && !receiptView.orderId.includes(',') ? `#${String(receiptView.orderId).slice(-8)}` : undefined}
                 />
              </div>

              {/* Cash tendered + change */}
              {receiptTendered != null && receiptTendered > 0 && receiptView.paymentMethod === 'cash' && (
                <div className="mx-3 mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-600 font-semibold">{t('given')}</span>
                    <span className="font-bold tabular-nums text-zinc-900">{receiptTendered.toFixed(2)} ₼</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-600 font-semibold">{t('bill_total')}</span>
                    <span className="font-bold tabular-nums text-zinc-900">{receiptView.total.toFixed(2)} ₼</span>
                  </div>
                  <div className="h-px bg-emerald-200/60" />
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-700 font-black text-sm">{t('change')}</span>
                    <span className="text-emerald-700 font-black text-lg tabular-nums">
                      {receiptTendered >= receiptView.total
                        ? `${(receiptTendered - receiptView.total).toFixed(2)} ₼`
                        : `-${(receiptView.total - receiptTendered).toFixed(2)} ₼`}
                    </span>
                  </div>
                </div>
              )}

              {/* Close button */}
              <div className="px-3 pb-4">
                <button
                  onClick={() => { setReceiptView(null); setReceiptTendered(undefined); }}
                  className="w-full py-3 rounded-xl bg-zinc-900 text-white text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all active:scale-[0.98]"
                >
                  {t('close')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bill Request Notification Popup — kassirə görsənir */}
      <AnimatePresence>
        {billNotify && (Date.now() - billNotify.time < 5000) && isCashierOrAdmin && (
          <motion.div
            key={`bill-notify-${billNotify.time}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={fastExit}
            className="fixed top-20 left-1/2 z-[130] bg-rose-500 text-white px-6 py-3 rounded-5xl shadow-elevated shadow-rose-500/40 flex items-center gap-3 cursor-pointer"
            onClick={() => { setBillNotify(null); pos.setActiveView('floor'); }}
          >
            <span className="w-3 h-3 rounded-full bg-white animate-ping" />
            <span className="text-sm font-black tracking-wide">
              MASA {billNotify.table} — HESAB ÇAĞIRILDI
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        <ClearTablePinModal
          open={clearPinTable != null}
          tableNumber={clearPinTable?.num || 0}
          onClose={() => setClearPinTable(null)}
          onConfirm={(pin, reason) => {
            const gate = clearPinTable;
            setClearPinTable(null);
            setActionSheetOpen(false);
            if (gate) {
              if (gate.mode === 'group') {
                void handleDismissGroup(pin, reason);
              } else {
                if (pos.selectedTable && pos.selectedTable.table_number === gate.num) pos.resetCart();
                if (gate.mode === 'dismiss') pos.dismissTable(gate.num, { manager_pin: pin, reason, terminal_id: undefined });
                else pos.clearTable(gate.num, { manager_pin: pin, reason });
              }
            }
          }}
        />

        </AnimatePresence>

        {/* 2026-09-26 (owner, Q7): virtual card terminal (simulator adapter) */}
        <TerminalTapModal
          open={terminalState != null}
          amount={terminalState?.amount || 0}
          onDone={(code) => {
            const st = terminalState;
            setTerminalState(null);
            if (st) void runPaymentFlow(st.method, st.tendered, st.tip, code);
          }}
          onClose={() => setTerminalState(null)}
        />

        {/* SHIFT REVIEW MODAL */}
        <AnimatePresence>
          {shiftReviewOpen && (
             // 2026-09-26 (Task 55): same VKB lift as the discount modal.
             <motion.div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ paddingBottom: 'calc(var(--vk-height, 0px) + 16px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleBackdrop}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShiftReviewOpen(false)} />
              <motion.div className={`relative w-full max-w-md rounded-3xl border p-6 shadow-2xl ${lightMode ? 'bg-white border-zinc-200' : 'bg-[var(--theme-surface)] border-white/10'}`} {...morphView}>
               <h2 className="text-lg font-black uppercase tracking-tight mb-1">Shift Review</h2>
               <p className={`text-xs mb-4 ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>Please declare your tips before clocking out</p>

               <div className="space-y-4">
                 <div>
                   <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>Declared Cash Tips</label>
                   <input type="number" step="0.01" placeholder="0.00" className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`} />
                 </div>
                 <div>
                   <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>Tip Out Amount</label>
                   <input type="number" step="0.01" placeholder="0.00" className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`} />
                 </div>
                 <div>
                   <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>Notes (optional)</label>
                   <textarea rows={2} placeholder="Any shift notes..." className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border resize-none ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`} />
                 </div>
               </div>

               <div className="flex gap-3 mt-6">
                 <button onClick={() => setShiftReviewOpen(false)} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-wider border ${lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                   Cancel
                 </button>
                 <button onClick={confirmClockOut} className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-600 transition-all active:scale-95 shadow-lg shadow-emerald-500/20">
                   Confirm & Clock Out
                 </button>
               </div>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

        {/* DISCOUNT MODAL (Phase-1 G1: canonical /api/orders/discount) */}
        <AnimatePresence>
          {discountOpen && (
             // 2026-09-26 (Task 55, audit55 P0): VKB covered the action buttons
             // by 51px and the card was not scrollable — lift via --vk-height +
             // let the card scroll when the keyboard is up.
             <motion.div className="fixed inset-0 z-[320] flex items-center justify-center p-4" style={{ paddingBottom: 'calc(var(--vk-height, 0px) + 16px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleBackdrop}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !discountBusy && setDiscountOpen(false)} />
               <motion.div className={`relative w-full max-w-sm max-h-[calc(100vh-var(--vk-height,0px)-32px)] overflow-y-auto rounded-3xl border p-6 shadow-2xl ${lightMode ? 'bg-white border-zinc-200' : 'bg-[var(--theme-surface)] border-white/10'}`} {...morphView}>
                 <h2 className="text-lg font-black uppercase tracking-tight mb-4">{t('discount_modal_title')}</h2>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button onClick={() => setDiscountType('percent')} className={`py-2.5 rounded-2xl text-sm font-black uppercase border transition-all ${discountType === 'percent' ? 'bg-indigo-500 text-white border-indigo-500' : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/50'}`}>{t('discount_mode_percent')}</button>
                  <button onClick={() => setDiscountType('fixed')} className={`py-2.5 rounded-2xl text-sm font-black uppercase border transition-all ${discountType === 'fixed' ? 'bg-indigo-500 text-white border-indigo-500' : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/50'}`}>{t('discount_mode_amount')}</button>
                </div>
                <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{discountType === 'percent' ? t('discount_percent_label') : t('discount_amount_label')}</label>
               <input
                 type="number" min="0" step={discountType === 'percent' ? '1' : '0.01'} value={discountValue}
                 onChange={(e) => setDiscountValue(e.target.value)} placeholder="0"
                 className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border mb-3 ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
               />
                <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('discount_reason_label')}</label>
                <input
                  type="text" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder={t('discount_reason_placeholder')}
                 className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border mb-5 ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
               />
               <div className="flex gap-3">
                  <button onClick={() => { if (!discountBusy) { setDiscountOpen(false); setDiscountValue(''); setDiscountReason(''); } }} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-wider border ${lightMode ? 'border-zinc-200 text-zinc-600' : 'border-white/10 text-white/50'}`}>{t('cancel')}</button>
                  <button onClick={submitDiscount} disabled={discountBusy} className="flex-1 py-3 rounded-2xl bg-indigo-500 text-white text-xs font-black uppercase tracking-wider hover:bg-indigo-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                    {discountBusy ? <Loader2 size={16} className="animate-spin" /> : null}
                    {discountBusy ? t('please_wait') : t('apply_discount_btn')}
                  </button>
               </div>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

       {/* Sprint-1: manager PIN override for >20% discounts */}
       <PinGuard
         open={discountPinOpen}
         onClose={() => { setDiscountPinOpen(false); setDiscountBusy(false); }}
         onVerified={(verified: PinVerified) => {
           setDiscountPinOpen(false);
           if (verified?.valid && verified.staffId) {
             void doSubmitDiscount(verified.staffId);
           }
         }}
         action="discount"
         title={t('manager_approval_required')}
       />

    {/* PAYMENT PARTIAL-OUTCOME MODAL (Phase-1 G2) */}
       <AnimatePresence>
         {payOutcome && (
            <motion.div className="fixed inset-0 z-[320] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleBackdrop}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPayOutcome(null)} />
              <motion.div className={`relative w-full max-w-sm rounded-3xl border p-6 shadow-2xl ${lightMode ? 'bg-white border-zinc-200' : 'bg-[var(--theme-surface)] border-white/10'}`} {...morphView}>
               <h2 className="text-lg font-black uppercase tracking-tight mb-1">Ödəniş nəticəsi</h2>
               {payOutcome.okCount > 0 && (
                 <p className={`text-sm font-bold mb-2 ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>{payOutcome.okCount} order ödənildi</p>
               )}
               {payOutcome.failed.length > 0 && (
                 <div className={`mb-4 rounded-2xl border p-3 ${lightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-500/10 border-rose-500/20'}`}>
                   <p className={`text-xs font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-rose-600' : 'text-rose-400'}`}>Ödənilmədi ({payOutcome.failed.length})</p>
                   <div className="space-y-1 max-h-32 overflow-y-auto">
                     {payOutcome.failed.map((f: any) => (
                       <p key={f.id || f.order_id} className={`text-[11px] font-bold ${lightMode ? 'text-rose-700' : 'text-rose-300'}`}>
                         Masa {f.table_number ?? '-'} · {f.error || 'Xəta'}
                       </p>
                     ))}
                   </div>
                 </div>
               )}
               <div className="flex gap-3">
                 <button onClick={() => setPayOutcome(null)} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-wider border ${lightMode ? 'border-zinc-200 text-zinc-600' : 'border-white/10 text-white/50'}`}>Bağla</button>
                 {payOutcome.failed.length > 0 && (
                   <button onClick={retryFailedPayments} className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-600 transition-all active:scale-95">
                     Yenidən cəhd ({payOutcome.failed.length})
                   </button>
                 )}
               </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence> 

        {/* U-4: unsent-cart guard — never discard silently.
            Owner UX (2026-09-21): back button top-left like a proper modal,
            and tapping any empty area of the backdrop closes the panel. */}
        <AnimatePresence>
          {unsentCartGuard && (
            <motion.div key="ui-unsent-guard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setUnsentCartGuard(false)}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
              <motion.div initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                transition={SPRING}
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-[var(--theme-surface)] border-[var(--theme-border)]'}`}>
                <motion.button onClick={() => setUnsentCartGuard(false)}
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.85 }} transition={TAP}
                  aria-label={t('back')}
                  className={`absolute top-4 left-4 w-8 h-8 rounded-full border flex items-center justify-center ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-100' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>
                  <X size={14} />
                </motion.button>
                <p className={`text-lg font-black tracking-tight text-center ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{t('unsent_items_title')}</p>
                <p className={`text-xs text-center mt-2 leading-relaxed ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>{t('unsent_items_question')}</p>
                {/* Owner UX (2026-09-21): bottom GERİ removed — the top-left X
                    (and backdrop tap) already close the modal. */}
                <div className="flex gap-3 mt-6">
                  <motion.button onClick={() => { setUnsentCartGuard(false); pos.clearCart(); pos.exitReservationMode(); setReservationMode(false); setReservationId(null); setReservationGuest(null); pos.setActiveView('floor'); setEditingOrder(null); }} whileTap={{ scale: 0.97 }} transition={TAP}
                    className="flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                    {t('unsent_items_discard')}
                  </motion.button>
                  <motion.button onClick={() => { setUnsentCartGuard(false); sendCurrentOrder(); }} whileTap={{ scale: 0.97 }} transition={TAP}
                    className="flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                    {t('unsent_items_send')}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

    </div>
    </VirtualKeyboardProvider>
  );
}
