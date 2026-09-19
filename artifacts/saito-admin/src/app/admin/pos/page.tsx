'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { fastExit, slideUp, appleBackdrop, appleCard, appleViewSwap, morphView } from '@/lib/modal-transitions';
import { X, Calendar, Utensils, UserCheck, Bike, Wallet, History, Clock, PanelLeftClose, PanelLeftOpen, Users, Loader2, AlertTriangle, Table2, RefreshCw } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { usePos, cartLineKey } from './hooks/usePos';
import { isFinalOrderStatus, FINAL_ORDER_STATUSES } from '@/lib/pos-tables';
import { useOrderStateMachine } from '@/hooks/useOrderStateMachine';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { PinGuard, type PinVerified } from './components/PinGuard';
import { ProductGrid, type ProductGridRef } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { playHapticSound } from '@/lib/haptic';
import ReservationActionSheet from './components/ReservationActionSheet';
import TakeawayOrders from './components/TakeawayOrders';
import DeliveryOrders from './components/DeliveryOrders';
import { CashDrawerPanel } from './components/CashDrawerPanel';
import { VirtualKeyboardProvider } from './components/VirtualKeyboard';
import { OrderHistory } from './components/OrderHistory';
import { FloorSkeleton, ProductGridSkeleton, CartSkeleton } from './components/PosSkeletons';
import { LiquidDropdown } from '@/components/ui/LiquidDropdown';
import { DragTabSwitcher } from '@/components/ui/DragTabSwitcher';
import { toast } from '@/lib/toast';
import { printReceipt, getReceiptSettings, printReservation } from '@/lib/print/PrintService';
import { apiFetch } from '@/lib/api-fetch';
import { supabase } from '@/lib/supabase';
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
}

export default function POSPage() {
  const { lightMode, setLightMode } = useTheme();
  const { t } = useLanguage();
  const pos = usePos();
  const router = useRouter();
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
  const [editingOrder, setEditingOrder] = useState<any>(null);
  
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  
  const [transferMode, setTransferMode] = useState(false);
  const [transferSource, setTransferSource] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [reservationArrival, setReservationArrival] = useState<{ table_number: number; reservation_id: string | null; name: string | null; guests: number; phone?: string | null; time?: string | null; is_vip?: boolean | null } | null>(null);

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
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [statusPickerTransitions, setStatusPickerTransitions] = useState<{ to_status: string; description: string | null; requires_role: string | null; requires_manager_pin: boolean }[]>([]);
  const [statusPickerEntity, setStatusPickerEntity] = useState<'order' | 'delivery'>('order');
  const [statusPickerLoading, setStatusPickerLoading] = useState(false);
  const [courierPickerOpen, setCourierPickerOpen] = useState(false);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [couriersLoading, setCouriersLoading] = useState(false);
  const pickedUpTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const posMode = pos.posMode;
  const setPosMode = pos.setPosMode;
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
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInTable, setWalkInTable] = useState('');
  const [walkInGuests, setWalkInGuests] = useState('1');
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInNotes, setWalkInNotes] = useState('');
  const [walkInPreOrder, setWalkInPreOrder] = useState(false);
  const [walkInScheduledDate, setWalkInScheduledDate] = useState('');
  const [walkInScheduledTime, setWalkInScheduledTime] = useState('');

  const [takeawayOrders, setTakeawayOrders] = useState<any[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<any[]>([]);

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
  }, [posMode]);

  const fetchTakeawayOrders = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/orders?order_source=takeaway&status=not.in.(${FINAL_ORDER_STATUSES.join(',')})`);
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
      const res = await apiFetch(`/api/orders?order_source=delivery&status=not.in.(${FINAL_ORDER_STATUSES.join(',')})`);
      if (res.ok) {
        const data = await res.json();
        setDeliveryOrders(data.orders || []);
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
    return () => clearInterval(poll);
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

  useEffect(() => {
    // 1) Try localStorage first (instant)
    const saved = localStorage.getItem('pos_session');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setPosSession(s);
        setPosRole(s.role);
        return;
      } catch { localStorage.removeItem('pos_session'); }
    }
    // 2) Development bypass — skip auth in dev mode
    if (process.env.NODE_ENV === 'development') {
      const devSession = { staffId: 'dev-001', name: 'DEV User', role: 'superadmin' };
      setPosSession(devSession);
      setPosRole('admin');
      localStorage.setItem('pos_session', JSON.stringify(devSession));
      return;
    }
    // 3) Try to restore from existing saito_token cookie (staff-login or admin-login)
    (async () => {
      try {
        const res = await fetch('/api/pos/session', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setPosSession(data);
          setPosRole(data.role);
          localStorage.setItem('pos_session', JSON.stringify(data));
        } else {
          // No valid session — redirect to canonical staff login
          window.location.href = '/staff/login?returnTo=/admin/pos';
        }
      } catch {
        window.location.href = '/staff/login?returnTo=/admin/pos';
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

  const handleClockIn = async () => {
    try {
      const csrf = typeof document !== 'undefined' ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] || '' : '';
      const res = await fetch('/api/pos/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ action: 'in', role_id: posSession?.role }),
      });
      if (res.ok) {
        setIsClockedIn(true);
        const staffRes = await fetch('/api/pos/staff');
        if (staffRes.ok) {
          const data = await staffRes.json();
          setActiveStaff(data.activeStaff || []);
        }
      }
    } catch {}
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
      if (posSession) {
        setPosSession(null);
        setPosRole(null);
        localStorage.removeItem('pos_session');
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch {}
        window.location.href = '/staff/login?returnTo=/admin/pos';
      }
    };
    window.addEventListener('pos:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pos:unauthorized', onUnauthorized);
  }, [posSession]);

  // Pre-fetch takeaway & delivery orders on mount so they're instant when switching tabs
  useEffect(() => {
    fetchTakeawayOrders();
    fetchDeliveryOrders();
  }, [fetchTakeawayOrders, fetchDeliveryOrders]);

  const handlePosLogout = async () => {
    setPosSession(null);
    setPosRole(null);
    localStorage.removeItem('pos_session');
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/staff/login?returnTo=/admin/pos';
  };

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
      pos.addToCart(product, {
        variantId: p.variant_id ?? null,
        notes: p.special_notes || undefined,
        modifiers: p.__modifiers || [],
        quantity: Math.max(1, Number(p.__qty) || 1),
        editOf: p.__editOf || undefined,
      });
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
      for (const order of activeOrders) {
        const items = (order.order_items || []).map((item: any) => ({
          name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
          quantity: item.quantity || 1,
          price: Number(item.total_price || item.price || 0),
        }));
        await printReceipt({
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
        });
      }
      toast.success(t('bill_printed'));
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

  const handleOpenStatusPicker = async (entity: 'order' | 'delivery') => {
    if (!actionSheetTable) return;
    setStatusPickerEntity(entity);
    setStatusPickerLoading(true);
    setStatusPickerOpen(true);
    try {
      const currentStatus = entity === 'delivery'
        ? (actionSheetTable.delivery_status || actionSheetTable.status)
        : actionSheetTable.status;
      const transitions = await orderStateMachine.getValidTransitions(currentStatus, entity);
      setStatusPickerTransitions(transitions);
    } catch (e) {
      toast.error(t('error_occurred'));
      setStatusPickerOpen(false);
    } finally {
      setStatusPickerLoading(false);
    }
  };

  const handleStatusTransitionSelect = async (toStatus: string) => {
    if (!actionSheetTable) return;
    setStatusPickerOpen(false);
    if (statusPickerEntity === 'delivery') {
      await orderStateMachine.transitionDelivery(actionSheetTable.id, toStatus as any, {
        courierId: actionSheetTable.courier_id,
        courierName: actionSheetTable.courier_name,
      });
    } else {
      await orderStateMachine.transition(actionSheetTable.id, toStatus as any);
    }
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

  const handleBillRequest = async (tableNumber: number) => {
    try {
      const res = await apiFetch('/api/orders/bill-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: tableNumber, bill_requested: true }),
      });
      if (res.ok) {
        toast.success(t('bill_called'));
        pos.fetchData();
        setActionSheetOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || t('error_occurred'));
      }
    } catch (e: any) {
      toast.error(e.message || t('error_occurred'));
    }
  };

  const handleDeliveryStatusPick = async () => {
    await handleOpenStatusPicker('delivery');
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


  const handlePaymentMethodSelect = async (method: 'cash' | 'card' | 'qr' | 'transfer' | 'corporate' | 'gift_card' | 'voucher' | 'room_charge' | string, tenderedAmount?: number, tipAmount?: number) => {
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
          }),
        });

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
      toast.success(t('all_orders_paid'), { id: 'action-toast' });

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
      });
      setReceiptTendered(method === 'cash' ? tenderedAmount : undefined);

      // Auto-print disabled — receipt only prints via "Print Bill" action
    } catch (e: any) {
      toast.error(e.message || t('payment_error'));
    }
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

  const handleDismissGroup = async () => {
    if (!actionSheetTable) return;
    toast.loading(t('clearing_group'), { id: 'action-toast' });
    await pos.dismissTable(actionSheetTable.table_number);
    setActionSheetOpen(false);
    if (pos.selectedTable && pos.selectedTable.table_number === actionSheetTable.table_number) {
      pos.resetCart();
    }
    toast.success(t('group_cleared').replace('{table}', String(actionSheetTable.table_number)));
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
      return !isChild;
    });
  }, [activeFloor?.tables]);

  const openTableWithPulse = (table: any) => {
    setTableTapPulse({ tableNumber: table.table_number, nonce: Date.now() });
    if (tableTapTimerRef.current) clearTimeout(tableTapTimerRef.current);
    tableTapTimerRef.current = setTimeout(() => {
      tableTapTimerRef.current = null;
      pos.selectTable(table);
    }, 150);
  };

  const handleTableTap = (table: any) => {
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
        setSelectedForMerge(p => [...p, table.table_number]);
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
        toast.error(t('enter_phone'));
        return;
      }
      if (posMode === 'delivery' && !pos.cart?.delivery_address?.trim()) {
        toast.error(t('enter_address'));
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
    } else {
      const autoCampaign = pos.getAutoCampaign(pos.cart);
      pos.placeOrder(autoCampaign ? { id: autoCampaign.id, type: 'AUTO' } : undefined, undefined, posSession?.staffId);
    }
  };

  // U-4: close the panel without discarding an unsent cart.
  const closeCartPanel = () => {
    pos.clearCart(); pos.exitReservationMode(); setReservationMode(false); setReservationId(null); setReservationGuest(null); if (pos.selectedTable && ['occupied', 'cooking', 'waiting_bill', 'waiting'].includes(pos.selectedTable.status)) { setFlashInfo({ tableNumber: pos.selectedTable.table_number, nonce: Date.now() }); } pos.setActiveView('floor'); setEditingOrder(null);
  };

  // 1.5 — VAT toggle (POS, manager PIN verified in ActionSheet before this runs).
  // Manager-override: if the session user lacks discount.approve, the PIN-
  // verified staffId is sent; the server re-verifies THAT staff's permission.
  const handleToggleVat = async (apply: boolean, pinVerified?: { staffId: string; role: string; name: string }) => {
    const orderId = resolveSheetOrderId();
    if (!orderId) return;
    toast.loading('ƏDV yenilənir…', { id: 'vat-toast' });
    try {
      const res = await apiFetch('/api/orders/apply-vat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          apply_vat: apply,
          approver_staff_id: pinVerified?.staffId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('error_occurred'), { id: 'vat-toast' });
        return;
      }
      toast.success(
        apply
          ? `ƏDV tətbiq edildi (+₼${(data.tax_amount ?? 0).toFixed(2)}) — cəm ₼${(data.total ?? 0).toFixed(2)}`
          : `ƏDV ləğv edildi — cəm ₼${(data.total ?? 0).toFixed(2)}`,
        { id: 'vat-toast' }
      );
      // Update selectedTable.orders[0] in-place so ActionSheet toggle reflects new state
      // on next open (fetchData refreshes tableOrderCache, not the selectedTable snapshot).
      pos.setSelectedTable((prev: any) => {
        if (!prev?.orders?.[0]) return prev;
        return { ...prev, orders: [{ ...prev.orders[0], apply_vat: data.apply_vat ?? apply, total_amount: data.total, tax_amount: data.tax_amount }] };
      });
      setActionSheetOpen(false);
      await pos.fetchData();
      await reconcileOrderFromServer(orderId);
    } catch (e: any) {
      toast.error(e.message || t('error_occurred'), { id: 'vat-toast' });
    }
  };

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
        stillFailed.push({ ...order, error: err.error });
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
            <DragTabSwitcher
              items={[
                { id: 'dine_in', label: t('dine_in'), icon: Utensils, dotColor: '#10b981' },
                { id: 'takeaway', label: t('takeaway'), icon: UserCheck, dotColor: '#3b82f6' },
                { id: 'delivery', label: t('delivery'), icon: Bike, dotColor: '#3b82f6' },
              ]}
              value={posMode}
              onChange={(mode) => {
                pos.switchMode(mode as 'dine_in' | 'takeaway' | 'delivery');
                pos.setActiveView('floor');
              }}
            />
           {pos.floors.length > 1 && posMode === 'dine_in' ? (
            <LiquidDropdown
              options={pos.floors.map((f: any) => ({ id: f.name, label: f.name }))}
              activeId={activeFloor?.name}
              onChange={setSelectedFloor}
            />
          ) : pos.floors.length > 1 ? (
            <div className="w-[120px]" />
          ) : null}
          <div className="flex-1" />
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
                 <div className={`w-2 h-2 rounded-full ${isClockedIn ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' : 'bg-zinc-500'}`} />
                 <span className="text-xs font-bold text-white/30 hidden sm:inline">{posSession.name}</span>
               </div>
               {!isClockedIn ? (
                 <button
                   onClick={handleClockIn}
                   className={`px-2 py-1 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'}`}
                   title="Clock In"
                 >
                   Giriş
                 </button>
               ) : (
                 <button
                   onClick={handleClockOut}
                   className={`px-2 py-1 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 hover:bg-rose-500/20' : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'}`}
                   title="Clock Out"
                 >
                   Çıxış
                 </button>
               )}
               <button
                 onClick={handlePosLogout}
                 className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
                 title={t('logout')}
               >
                 <X size={14} />
               </button>
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
                    exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    className="flex items-center justify-end gap-3 mb-6"
                  >
                    <div className="flex items-center gap-2">
                     <button
                       onClick={() => router.push('/admin/reservations')}
                       className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100' : 'border-white/10 text-white/80 hover:text-white hover:bg-white/10'}`}
                       title={t('reservations')}
                     >
                       <Calendar size={16} />
                       <span className="hidden sm:inline">{t('reservations')}</span>
                     </button>
                     <button
                       onClick={() => { playHapticSound('select'); setWalkInOpen(true); }}
                       className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100' : 'bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30'}`}
                     >
                       <span>+</span>
                        <span className="hidden sm:inline">{t('walk_in')}</span>
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
                      <button
                        onClick={() => {
                          if (!document.fullscreenElement) {
                           document.documentElement.requestFullscreen().catch(() => {});
                         } else {
                           document.exitFullscreen();
                         }
                         setCleanMode(!cleanMode);
                       }}
                       className={`p-2.5 rounded-full border transition-all ${cleanMode ? 'bg-gold text-black border-gold' : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                       title={t('fullscreen')}
                     >
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                       </svg>
                     </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="normal-toolbar"
                    initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                  >
                    <div className="flex items-center justify-end gap-3 mb-6">
                     <button
                       onClick={() => router.push('/admin/reservations')}
                       className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                       title={t('reservations')}
                     >
                       <Calendar size={16} />
                       <span className="hidden sm:inline">{t('reservations')}</span>
                     </button>
                      <button
                        onClick={() => { playHapticSound('select'); setWalkInOpen(true); }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all active:scale-[0.95] ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100' : 'bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30'}`}
                      >
                        <span>+</span>
                         <span className="hidden sm:inline">{t('walk_in')}</span>
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
                      <button
                       onClick={() => {
                         if (!document.fullscreenElement) {
                           document.documentElement.requestFullscreen().catch(() => {});
                         } else {
                           document.exitFullscreen();
                         }
                         setCleanMode(!cleanMode);
                       }}
                       className={`p-3 rounded-full border transition-all ${cleanMode ? 'bg-gold text-black border-gold' : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                       title={t('fullscreen')}
                     >
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                       </svg>
                     </button>
                  </div>
                  </motion.div>
                )}
                </AnimatePresence>

                  {reservationArrival && (
                   <ReservationActionSheet
                     open={!!reservationArrival}
                     onClose={() => setReservationArrival(null)}
                     table={{
                       table_number: reservationArrival.table_number,
                       reservation_id: reservationArrival.reservation_id,
                       reservation_name: reservationArrival.name,
                       reservation_phone: reservationArrival.phone,
                       reservation_time: reservationArrival.time,
                       guest_count: reservationArrival.guests,
                       status: 'reserved',
                       is_vip: reservationArrival.is_vip,
                     }}
                     onGuestArrived={() => handleGuestArrived(reservationArrival)}
                     onEditReservation={() => {
                       setReservationArrival(null);
                       if (reservationArrival.reservation_id) {
                         router.push(`/admin/reservations?edit=${reservationArrival.reservation_id}`);
                       }
                     }}
                     onMoveTable={async () => {
                       setReservationArrival(null);
                       if (reservationArrival && reservationArrival.reservation_id) {
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
                               reservation_id: reservationArrival.reservation_id,
                               from_table: reservationArrival.table_number,
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
                       if (reservationArrival && reservationArrival.reservation_id) {
                          const extraTables = prompt(t('merge_tables_prompt'));
                         if (!extraTables) return;
                         const tableNums = extraTables.split(',').map((t) => parseInt(t.trim(), 10)).filter((n) => !isNaN(n));
                         if (tableNums.length === 0) {
                           toast.error(t('invalid_table_numbers'));
                           return;
                         }
                         tableNums.unshift(reservationArrival.table_number);
                         try {
                           const res = await apiFetch('/api/reservations/merge-tables', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({
                               reservation_id: reservationArrival.reservation_id,
                               table_numbers: tableNums,
                               terminal_id: pos.terminalId,
                             }),
                           });
                           if (res.ok) {
                             toast.success(t('tables_merged'));
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
                       if (reservationArrival.reservation_id) {
                         try {
                           const res = await apiFetch('/api/reservations/cancel', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ reservation_id: reservationArrival.reservation_id, terminal_id: pos.terminalId }),
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
                       if (reservationArrival.reservation_id) {
                         try {
                           const res = await apiFetch('/api/reservations/no-show', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ reservation_id: reservationArrival.reservation_id, terminal_id: pos.terminalId }),
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
                       if (!reservationArrival?.reservation_id) return;
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
                           tableNumber: reservationArrival.table_number,
                           reservationId: reservationArrival.reservation_id,
                           guestName: reservationArrival.name || '',
                           phone: reservationArrival.phone || '',
                           guests: reservationArrival.guests || 0,
                           time: reservationArrival.time || '',
                           isVip: reservationArrival.is_vip || false,
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
                 {mergeMode && selectedForMerge.length >= 2 && (() => {
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
                         exit={{ opacity: 0, y: -8, scale: 0.96 }}
                         transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                         className="mb-4"
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
                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${lightMode ? 'bg-amber-50 text-amber-500' : 'bg-amber-500/10 text-amber-400'}`}>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                   {visibleTables?.map((table: any, _tableIdx: number) => {
                     const groupInfo = tableGroupInfo[table.table_number];
                     const isGroup = groupInfo && groupInfo.children.length > 0;
                     
                     return (
                       <div
                         key={`tbl-${table.table_number ?? table.id ?? _tableIdx}`}
                         className="col-span-1"
                       >
                       <TableCard 
                         table={table}
                         onTap={() => handleTableTap(table)}
                         onAction={() => handleOpenAction(table)}
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
                       </div>
                     );
                   })}
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
                  pos.setActiveView('order');
                }}
                onSelectOrder={(order) => {
                  setEditingOrder(order);
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
                  pos.setActiveView('order');
                }}
                onSelectOrder={(order) => {
                  setEditingOrder(order);
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
                     <div
                          className="flex-1 p-6 overflow-y-auto min-h-0 overscroll-contain"
                        >
                           <ProductGrid
                           ref={gridRef}
                           products={pos.products}
                           categories={pos.categories}
                           combos={pos.combos}
                           variantsByProduct={pos.variantsByProduct}
                           onAddProduct={(p) => handleProductTap(p)}
                          onAddCombo={(c) => pos.addComboToCart(c)}
                          cartCounts={(pos.cart?.items ?? []).reduce((acc: Record<string, number>, item: any) => {
                            const id = item.product_id;
                            acc[id] = (acc[id] || 0) + (item.quantity || 0);
                            return acc;
                          }, {})}
                           outOfStock={new Set((pos.products ?? []).filter((p: any) => p.is_in_stock === false || p.is_available === false).map((p: any) => p.id))}
                           catalogError={pos.catalogLoadFailed}
                           onRetryCatalog={() => pos.fetchData()}
                           />
                      </div>
                      <div
                         className="w-[440px] flex-shrink-0 border-l flex flex-col overflow-hidden min-h-0"
                        >
                             {posMode !== 'dine_in' && (
                             <div className="flex-shrink-0 overflow-y-auto min-h-0 max-h-[44%] px-4 pt-3 pb-2 space-y-2.5 border-b border-black/5 dark:border-white/10 overscroll-contain">
                             <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className={`text-xs font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                  {t('customer_phone')} {posMode === 'delivery' ? '*' : ''}
                                </label>
                                <input
                                  type="tel"
                                  value={pos.cart?.customer_phone || ''}
                                  onChange={e => {
                                    if (!pos.cart) return;
                                    pos.setCart({ ...pos.cart, customer_phone: e.target.value || null });
                                  }}
                                  placeholder={t('phone_placeholder')}
                                  className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                                />
                              </div>
                              <div>
                                <label className={`text-xs font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                  {t('customer_name')}
                                </label>
                                <input
                                  type="text"
                                  value={pos.cart?.customer_name || ''}
                                  onChange={e => {
                                    if (!pos.cart) return;
                                    pos.setCart({ ...pos.cart, customer_name: e.target.value || null });
                                  }}
                                  placeholder={t('customer_name_placeholder')}
                                  className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                                />
                              </div>
                            </div>

                            {posMode === 'delivery' && (
                              <div>
                                <label className={`text-xs font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                  {t('delivery_address')} *
                                </label>
                                <textarea
                                  value={pos.cart?.delivery_address || ''}
                                  onChange={e => {
                                    if (!pos.cart) return;
                                    pos.setCart({ ...pos.cart, delivery_address: e.target.value || null });
                                  }}
                                  placeholder={t('address_placeholder')}
                                  rows={2}
                                  className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all resize-none ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                                />
                              </div>
                            )}

                           <div className="grid grid-cols-2 gap-2">
                             {posMode === 'delivery' && (
                               <div>
                                  <label className={`text-xs font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                    {t('delivery_fee')} (₼)
                                  </label>
                                 <input
                                   type="number"
                                   step="0.01"
                                   min="0"
                                   value={pos.cart?.delivery_fee || ''}
                                   onChange={e => {
                                     if (!pos.cart) return;
                                     pos.setCart({ ...pos.cart, delivery_fee: Number(e.target.value) || 0 });
                                   }}
                                   placeholder="0.00"
                                   className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                                 />
                               </div>
                             )}
                             <div>
                                <label className={`text-xs font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                  {t('notes')}
                                </label>
                                <input
                                  type="text"
                                  value={pos.cart?.notes || ''}
                                  onChange={e => {
                                    if (!pos.cart) return;
                                    pos.setCart({ ...pos.cart, notes: e.target.value });
                                  }}
                                  placeholder={t('note_placeholder')}
                                  className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                                />
                             </div>
                           </div>
                         </div>
                       )}
                        <CartPanel
                           cart={pos.cart}
                           cartHydrating={pos.cartHydrating}
                           onPlaceOrder={sendCurrentOrder}
                           onBack={() => {
                             // U-4: an unsent cart must never be discarded
                             // silently. unsent = quantity beyond what was
                             // already sent (placeOrder tracks sentQuantity).
                             const unsentQty = (pos.cart?.items || []).reduce((s: number, i: any) => s + Math.max(0, (i.quantity || 0) - (i.sentQuantity || 0)), 0);
                             if (!pos.placingOrder && unsentQty > 0) { setUnsentCartGuard(true); return; }
                             closeCartPanel();
                           }}
                         orderButtonStatus={pos.placingOrder ? 'loading' : 'idle'}
                         onUpdateQty={(idx, delta) => pos.updateCartItemQty(idx, delta)}
                          onEditGuestCount={() => { setActionSheetOpen(true); }}
                          onGuestCountSaved={(count) => {
                              if (pos.cart) pos.setCart({ ...pos.cart, guest_count: count });
                              pos.fetchData();
                            }}
                         onUpdateCustomer={(name) => pos.updateCartCustomer(pos.cart?.customer_id || null, name)}
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
                           if (pos.selectedTable) pos.selectTable(pos.selectedTable, { force: true });
                         }}
                         onUpdateDeliveryFields={(fields) => {
                           if (!pos.cart) return;
                           pos.setCart({ ...pos.cart, ...fields });
                         }}
                         onUpdateGlobalNote={(note) => {
                           if (!pos.cart) return;
                           pos.setCart({ ...pos.cart, notes: note });
                         }}
                           onOpenModifiers={(productId) => {
                             const product = pos.products.find((p: any) => p.id === productId);
                             if (product) gridRef.current?.openEditor(productId);
                           }}
                            onRequestEditor={(productId, lineIndex) => {
                              const items = (pos.cart?.items || []) as any[];
                              // Dəqiq sətir: CartPanel öz indeksini göndərir —
                              // eyni məhsuldan çox sətir olanda həmişə birincini yığmamaq üçün.
                              const byIndex = typeof lineIndex === 'number' ? items[lineIndex] : undefined;
                              const match = byIndex && byIndex.product_id === productId && !byIndex.__isCombo && !(byIndex.sentQuantity ?? 0)
                                ? byIndex
                                : items.find((it: any) =>
                                    it.product_id === productId &&
                                    !(it.sentQuantity ?? 0) && !it.__isCombo
                                  );
                              if (!match) {
                                gridRef.current?.toggleEditor(productId);
                                return;
                              }
                              const preset = {
                                variantId: match.variant_id ?? null,
                                note: match.special_notes || '',
                                modifiers: (match.modifiers || []).reduce((acc: Record<string, number>, m: any) => {
                                  acc[m.id] = (acc[m.id] || 0) + (m.quantity || 1);
                                  return acc;
                                }, {} as Record<string, number>),
                                quantity: match.quantity || 1,
                                identity: cartLineKey(match.variant_id, match.special_notes, match.modifiers),
                              };
                              gridRef.current?.toggleEditor(productId, preset);
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
            onDeliveryStatus={handleDeliveryStatusPick}
            onTakeawayStatus={() => handleOpenStatusPicker('order')}
            onMarkServed={handleMarkServed}
             onDiscount={() => setDiscountOpen(true)}
             onToggleVat={handleToggleVat}
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
               pos.dismissTable(actionSheetTable.table_number);
               setActionSheetOpen(false);
             }
           }}
           onReleaseTable={async () => {
             if (!actionSheetTable) return;
             const res = await pos.releaseTable(actionSheetTable.table_number);
             if (res.ok) setActionSheetOpen(false);
           }}
         onDismissGroup={handleDismissGroup}
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
             if (actionSheetTable) { 
               pos.clearTable(actionSheetTable.table_number); 
               if (pos.selectedTable && pos.selectedTable.table_number === actionSheetTable.table_number) {
                 pos.resetCart();
               }
               setActionSheetOpen(false); 
             } 
           }}
          posRole={posRole}
            groupNumber={actionSheetTable ? tableGroupInfo[actionSheetTable.table_number]?.groupNum : undefined}
             customerId={pos.cart?.customer_id}
            customerName={pos.cart?.customer_name}
            onSelectCustomer={(customerId, customerName, customerPhone) => {
              pos.updateCartCustomer(customerId, customerName);
              // OS BUILD #1b: the order already exists (table opened earlier) —
              // cart state alone would send points to the wrong/none customer.
              // PATCH the live order so the loyalty spine credits the right one.
              const oid = actionSheetTable?.current_order_id || actionSheetTable?.orders?.[0]?.id;
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
            }}
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
             statusPickerTransitions={statusPickerTransitions}
             onSelectTransition={handleStatusTransitionSelect}
             statusPickerLoading={statusPickerLoading}
             onCloseStatusPicker={() => setStatusPickerOpen(false)}
             statusPickerOpen={statusPickerOpen}
             courierPickerOpen={courierPickerOpen}
             couriers={couriers}
             couriersLoading={couriersLoading}
             onOpenCourierPicker={handleOpenCourierPicker}
             onAssignCourier={handleAssignCourier}
             onCloseCourierPicker={() => setCourierPickerOpen(false)}
           />

      <CashDrawerPanel
        open={cashDrawerOpen}
        onClose={() => setCashDrawerOpen(false)}
      />

      <OrderHistory
        open={orderHistoryOpen}
        onClose={() => setOrderHistoryOpen(false)}
        posRole={posRole}
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
                <h2 className="text-sm font-black text-emerald-600 tracking-tight uppercase">
                  {t('order_paid')} ✓
                </h2>
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

      {/* Walk-In Modal */}
      <AnimatePresence>
        {walkInOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={appleBackdrop}
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/25 backdrop-blur-sm p-4"
            style={{ paddingBottom: 'var(--vk-height, 0px)' }}
            onClick={() => setWalkInOpen(false)}
          >
             <motion.div
               {...slideUp}
               onClick={e => e.stopPropagation()}
                className={`w-full max-w-sm rounded-3xl p-7 shadow-elevated border backdrop-blur-lg ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
             >
              <p className={`text-xl font-black tracking-tight mb-1 ${lightMode ? 'text-black' : 'text-white'}`}>{t('walk_in')}</p>
              <p className={`text-xs font-black uppercase tracking-widest mb-5 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('new_guest')}</p>
              <div className="space-y-3 mb-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Masa №</label>
                    <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('table_number')}</label>
                   <input type="number" min="1" value={walkInTable} onChange={e => setWalkInTable(e.target.value)} autoFocus
                      className={`w-full rounded-2xl px-4 py-3 text-base font-bold outline-none border ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('guests')}</label>
                    <input type="number" min="1" value={walkInGuests} onChange={e => setWalkInGuests(e.target.value)}
                      className={`w-full rounded-2xl px-4 py-3 text-base font-bold outline-none border ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('customer_name')}</label>
                   <input type="text" value={walkInName} onChange={e => setWalkInName(e.target.value)} placeholder={t('customer_name_placeholder')}
                     className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black placeholder:text-zinc-400 focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-zinc-400/50'}`}
                   />
                </div>
                <div>
                  <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('customer_phone')}</label>
                  <input type="tel" value={walkInPhone} onChange={e => setWalkInPhone(e.target.value)} placeholder={t('phone_placeholder')}
                     className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black placeholder:text-zinc-400 focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-zinc-400/50'}`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('notes')}</label>
                  <textarea value={walkInNotes} onChange={e => setWalkInNotes(e.target.value)} placeholder={t('note_placeholder')}
                     rows={2}
                     className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border resize-none transition-all ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black placeholder:text-zinc-400 focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-zinc-400/50'}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="walkInPreOrder" checked={walkInPreOrder} onChange={e => { setWalkInPreOrder(e.target.checked); if (!e.target.checked) { setWalkInScheduledDate(''); setWalkInScheduledTime(''); } }}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-500 focus:ring-zinc-400"
                  />
                      <label htmlFor="walkInPreOrder" className={`text-xs font-black uppercase tracking-wider ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
                        {t('pre_order')}
                      </label>
                </div>
                {walkInPreOrder && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('date')}</label>
                      <input type="date" data-vk="none" value={walkInScheduledDate} onChange={e => setWalkInScheduledDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                      />
                    </div>
                    <div>
                      <label className={`text-xs font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('time')}</label>
                      <input type="time" data-vk="none" value={walkInScheduledTime} onChange={e => setWalkInScheduledTime(e.target.value)}
                        className={`w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setWalkInOpen(false); setWalkInTable(''); setWalkInGuests('1'); setWalkInName(''); setWalkInPhone(''); setWalkInNotes(''); setWalkInPreOrder(false); setWalkInScheduledDate(''); setWalkInScheduledTime(''); }} className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-wider border ${lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                  {t('cancel')}
                </button>
                <button
                  onClick={async () => {
                    const tableNum = Number(walkInTable);
                    const guests = Number(walkInGuests) || 1;
                    if (!tableNum) return;
                    try {
                      const res = await apiFetch('/api/reservations/walk-in', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ table_number: tableNum, guests, name: walkInName || null, phone: walkInPhone || null, order_type: 'dine_in', notes: walkInNotes || null, pre_order: walkInPreOrder, scheduled_date: walkInPreOrder ? walkInScheduledDate : null, scheduled_time: walkInPreOrder ? walkInScheduledTime : null }),
                      });
                      if (res.ok) { toast.success(t('walk_in_created')); pos.fetchData(); }
                      else { const err = await res.json(); toast.error(err.error || t('walk_in_failed')); }
                    } catch { toast.error(t('error')); }
                    setWalkInOpen(false); setWalkInTable(''); setWalkInGuests('1'); setWalkInName(''); setWalkInPhone(''); setWalkInNotes(''); setWalkInPreOrder(false); setWalkInScheduledDate(''); setWalkInScheduledTime('');
                  }}
                  disabled={!walkInTable || Number(walkInTable) < 1}
                  className="flex-1 py-4 rounded-2xl bg-amber-500 text-white text-xs font-black uppercase tracking-wider hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-30 shadow-lg shadow-amber-500/20"
                >
                  {t('confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
       </AnimatePresence>

       {/* SHIFT REVIEW MODAL */}
       <AnimatePresence>
         {shiftReviewOpen && (
            <motion.div className="fixed inset-0 z-[300] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleBackdrop}>
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
            <motion.div className="fixed inset-0 z-[320] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleBackdrop}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !discountBusy && setDiscountOpen(false)} />
              <motion.div className={`relative w-full max-w-sm rounded-3xl border p-6 shadow-2xl ${lightMode ? 'bg-white border-zinc-200' : 'bg-[var(--theme-surface)] border-white/10'}`} {...morphView}>
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

        {/* U-4: unsent-cart guard — never discard silently */}
        <AnimatePresence>
          {unsentCartGuard && (
            <motion.div key="ui-unsent-guard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
              <motion.div initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                className={`w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-[var(--theme-surface)] border-[var(--theme-border)]'}`}>
                <p className={`text-lg font-black tracking-tight text-center ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{t('unsent_items_title')}</p>
                <p className={`text-xs text-center mt-2 leading-relaxed ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>{t('unsent_items_question')}</p>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setUnsentCartGuard(false)}
                    className={`flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                    {t('back')}
                  </button>
                  <button onClick={() => { setUnsentCartGuard(false); closeCartPanel(); }}
                    className="flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white active:scale-[0.98] transition-all shadow-lg shadow-rose-500/20">
                    {t('unsent_items_discard')}
                  </button>
                  <button onClick={() => { setUnsentCartGuard(false); sendCurrentOrder(); }}
                    className="flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20">
                    {t('unsent_items_send')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

    </div>
    </VirtualKeyboardProvider>
  );
}
