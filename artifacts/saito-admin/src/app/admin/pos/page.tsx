'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, X, Calendar, Utensils, UserCheck, Bike, Wallet, History, Clock, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
import ReservationActionSheet from './components/ReservationActionSheet';
import TakeawayOrders from './components/TakeawayOrders';
import DeliveryOrders from './components/DeliveryOrders';
import CheckoutModal from './components/CheckoutModal';
import { CashDrawerPanel } from './components/CashDrawerPanel';
import { OrderHistory } from './components/OrderHistory';
import { FloorSkeleton, ProductGridSkeleton, CartSkeleton, TakeawayOrdersSkeleton, DeliveryOrdersSkeleton } from './components/PosSkeletons';
import { LiquidDropdown } from '@/components/ui/LiquidDropdown';
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
}

export default function POSPage() {
  const { lightMode, setLightMode } = useTheme();
  const pos = usePos();
  const router = useRouter();
   
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTable, setActionSheetTable] = useState<any>(null);
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

  const [lastUndo, setLastUndo] = useState<any>(null);
  const [cleanMode, setCleanMode] = useState(false);
  const [paymentView, setPaymentView] = useState(false);
  const [receiptView, setReceiptView] = useState<PosReceipt | null>(null);
  const [receiptTendered, setReceiptTendered] = useState<number | undefined>(undefined);
  const posMode = pos.posMode;
  const setPosMode = pos.setPosMode;
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [posRole, setPosRole] = useState<string | null>(null);
  const posRoleNorm = posRole?.toLowerCase() || '';
  const isCashierOrAdmin = ['kassir', 'superadmin', 'admin', 'manager'].includes(posRoleNorm);
  const isManagerOrAbove = ['manager', 'superadmin'].includes(posRoleNorm);
  const [posSession, setPosSession] = useState<{ staffId: string; name: string; role: string; shift?: string } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInTable, setWalkInTable] = useState('');
  const [walkInGuests, setWalkInGuests] = useState('1');

  const [takeawayOrders, setTakeawayOrders] = useState<any[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<any[]>([]);

  const fetchTakeawayOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders?order_source=takeaway&status=not.in.(paid,cancelled,closed)');
      if (res.ok) {
        const data = await res.json();
        setTakeawayOrders(data.orders || []);
      } else {
        toast.error('Gel-al sifarişlər yüklənə bilmədi');
      }
    } catch (e) {
      console.error('Failed to fetch takeaway orders:', e);
      toast.error('Gel-al sifarişlər yüklənə bilmədi');
    }
  }, []);

  const fetchDeliveryOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders?order_source=delivery&status=not.in.(paid,cancelled,closed)');
      if (res.ok) {
        const data = await res.json();
        setDeliveryOrders(data.orders || []);
      } else {
        toast.error('Çatdırma sifarişləri yüklənə bilmədi');
      }
    } catch (e) {
      console.error('Failed to fetch delivery orders:', e);
      toast.error('Çatdırma sifarişləri yüklənə bilmədi');
    }
  }, []);

  useEffect(() => {
    if (posMode === 'takeaway') fetchTakeawayOrders();
    if (posMode === 'delivery') fetchDeliveryOrders();
  }, [posMode, fetchTakeawayOrders, fetchDeliveryOrders]);

  useEffect(() => {
    if (actionSheetOpen || paymentView || checkoutOpen) return;
    const poll = setInterval(() => {
      if (posMode === 'takeaway') fetchTakeawayOrders();
      if (posMode === 'delivery') fetchDeliveryOrders();
    }, 15000);
    return () => clearInterval(poll);
  }, [posMode, fetchTakeawayOrders, fetchDeliveryOrders, actionSheetOpen, paymentView, checkoutOpen]);

  useEffect(() => {
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
    // 2) Try to restore from existing saito_token cookie (staff-login or admin-login)
    (async () => {
      try {
        const res = await fetch('/api/pos/session', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setPosSession(data);
          setPosRole(data.role);
          localStorage.setItem('pos_session', JSON.stringify(data));
        } else {
          // No valid session — redirect to staff login
          window.location.href = '/staff/login';
        }
      } catch {
        window.location.href = '/staff/login';
      }
    })();
  }, []);

  const handlePosLogout = () => {
    setPosSession(null);
    setPosRole(null);
    localStorage.removeItem('pos_session');
    document.cookie = 'saito_token=; path=/; max-age=0; SameSite=Lax';
    document.cookie = 'saito_token=; path=/admin; max-age=0; SameSite=Lax';
    document.cookie = 'saito_token=; path=/; max-age=0';
    window.location.href = '/staff/login';
  };

  const [modalProduct, setModalProduct] = useState<{ product: PosProduct; variants: any[] } | null>(null);

   // Reservation → pre-order handoff: the reservations page navigates here with
   // ?resId=&tableIds=&guestName= and also writes a localStorage context. When
   // present we enter reservation mode: auto-select the target table, link the
   // cart/order to the reservation, and show a "Bron Et" (Reserve) action.
   const searchParams = useSearchParams();
   const [reservationMode, setReservationMode] = useState(false);
   const [reservationId, setReservationId] = useState<string | null>(null);
   const [reservationGuest, setReservationGuest] = useState<string | null>(null);

   useEffect(() => {
     if (posMode === 'dine_in') return;
     setSelectedFloor(null);
     setReservationMode(false);
     setReservationId(null);
     setReservationGuest(null);
   }, [posMode]);

  useEffect(() => {
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
    const variants = pos.variantsByProduct[product.id] || [];
    if (variants.length > 0) {
      setModalProduct({ product, variants });
    } else {
      pos.addToCart(product);
    }
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
        !['paid', 'cancelled', 'closed'].includes(o.status) && tableNumbers.includes(o.table_number)
      );
      if (activeOrders.length === 0) { toast.error('Sifariş tapılmadı'); return; }
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
      toast.success('Hesab çap olundu');
    } catch {
      toast.error('Çap xətası');
    }
  };

  const handleOpenOrderSheet = (order: any) => {
    setActionSheetTable({
      ...order,
      table_number: order.order_number || order.id,
    });
    setActionSheetOpen(true);
  };

  const TAKEAWAY_STATUS_NEXT: Record<string, string> = {
    new: 'confirmed',
    confirmed: 'in_kitchen',
    in_kitchen: 'ready',
    ready: 'payment_pending',
  };
  const TAKEAWAY_STATUS_LABEL: Record<string, string> = {
    new: 'Təsdiqləndi',
    confirmed: 'Mətbəxdə',
    in_kitchen: 'Hazırdır',
    ready: 'Ödənişə',
  };

  const handleTakeawayStatusAdvance = async () => {
    if (!actionSheetTable) return;
    const current = actionSheetTable.status;
    const next = TAKEAWAY_STATUS_NEXT[current];
    if (!next) return;
    try {
      const res = await apiFetch('/api/orders/delivery-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: actionSheetTable.id, status: next }),
      });
      if (res.ok) {
        toast.success(`${TAKEAWAY_STATUS_LABEL[current] || current}`);
        setActionSheetTable({ ...actionSheetTable, status: next });
        pos.fetchData();
        fetchTakeawayOrders();
      } else {
        toast.error('Status dəyişdirilə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
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
        toast.success('Hesab çağırıldı — kassirə göndərildi');
        pos.fetchData();
        setActionSheetOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta');
      }
    } catch (e: any) {
      toast.error(e.message || 'Xəta');
    }
  };

  const handleDeliveryStatusUpdate = async (status: string, orderIdOverride?: string) => {
    const orderId = orderIdOverride || actionSheetTable?.id || actionSheetTable?.order_ids?.[0];
    if (!orderId) return;
    try {
      const res = await apiFetch('/api/orders/delivery-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status,
          courier_id: actionSheetTable?.courier_id,
          courier_name: actionSheetTable?.courier_name,
          tracking_number: actionSheetTable?.tracking_number,
        }),
      });
      if (res.ok) {
        toast.success(`Status yeniləndi: ${status}`);
        setActionSheetOpen(false);
        pos.fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Status yenilənmədi');
      }
    } catch (e: any) {
      toast.error(e.message || 'Xəta');
    }
  };

  const handlePaymentMethodSelect = async (method: 'cash' | 'card' | 'qr' | 'transfer' | 'corporate' | 'gift_card' | 'voucher' | string, tenderedAmount?: number) => {
    if (posMode === 'delivery' && ['pending', 'preparing', 'ready', 'picked_up', 'in_transit', 'delivered', 'cancelled'].includes(method)) {
      await handleDeliveryStatusUpdate(method);
      return;
    }
    if (!actionSheetTable) return;
    const tableNumbers = actionSheetGroup
      ? [actionSheetTable.table_number, ...actionSheetGroup.children.map((c: any) => c.table_number)]
      : (actionSheetTable ? [actionSheetTable.table_number] : []);

    toast.loading('Ödəniş işlənir...', { id: 'action-toast' });
    try {
      // For takeaway/delivery: pay for the SPECIFIC selected order
      if (posMode !== 'dine_in' && actionSheetTable?.id) {
        const specificOrderRes = await apiFetch(`/api/orders?id=eq.${actionSheetTable.id}`);
        if (!specificOrderRes.ok) throw new Error('Failed to fetch order');
        const specificData = await specificOrderRes.json();
        const specificOrder = (specificData.orders || [])[0];
        
        if (!specificOrder) {
          toast.error('Sifariş tapılmadı', { id: 'action-toast' });
          return;
        }

        const total = specificOrder.total_amount || 0;
        const payRes = await apiFetch('/api/orders/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: specificOrder.id,
            payment_method: method,
            paid_amount: total,
            tip_amount: 0,
            campaign_id: specificOrder.campaign_id || undefined,
            discount_amount: specificOrder.discount_amount || 0,
            discount_type: specificOrder.discount_type || 'fixed',
          }),
        });

        if (!payRes.ok) {
          const err = await payRes.json();
          toast.error(err.error || 'Ödəniş uğursuz oldu', { id: 'action-toast' });
          return;
        }

        toast.success('Sifariş ödənildi', { id: 'action-toast' });
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
          tip: Number(specificOrder.tip_amount) || 0,
          total: Number(specificOrder.total_amount) || 0,
          paymentMethod: method,
          cashAmount: method === 'cash' ? Number(specificOrder.total_amount) || 0 : 0,
          cardAmount: (method === 'card' || method === 'transfer') ? Number(specificOrder.total_amount) || 0 : 0,
        });
        setReceiptTendered(method === 'cash' ? tenderedAmount : undefined);
        setPaymentView(false);
        setActionSheetOpen(false);
        pos.fetchData();
        if (posMode === 'takeaway') fetchTakeawayOrders();
        if (posMode === 'delivery') fetchDeliveryOrders();
        return;
      }

      const ordersRes = await apiFetch('/api/orders');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();
      let activeOrders = (ordersData.orders || []).filter((o: any) => 
        !['paid', 'cancelled', 'closed'].includes(o.status)
      );
      if (posMode === 'dine_in' && tableNumbers.length > 0) {
        activeOrders = activeOrders.filter((o: any) => tableNumbers.includes(o.table_number));
      } else if (posMode !== 'dine_in') {
        activeOrders = activeOrders.filter((o: any) => o.order_source === posMode || o.order_type === posMode);
      }
      
      if (activeOrders.length === 0) {
        toast.error('Aktiv sifariş tapılmadı', { id: 'action-toast' });
        return;
      }

      const failedOrders: string[] = [];
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
            tip_amount: 0,
            campaign_id: activeOrder.campaign_id || undefined,
            discount_amount: activeOrder.discount_amount || 0,
            discount_type: activeOrder.discount_type || 'fixed',
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          failedOrders.push(activeOrder.id);
          console.error(`Payment failed for order ${activeOrder.id}:`, err);
        }
      }

      if (failedOrders.length > 0) {
        toast.error(`${failedOrders.length} sifariş ödənilərkən xəta baş verdi. Yenidən cəhd edin.`, { id: 'action-toast' });
        return;
      } else {
        toast.success('Bütün sifarişlər ödənildi', { id: 'action-toast' });
      }

      setPaymentView(false);
      setActionSheetOpen(false);
      pos.fetchData();

      // Build an on-screen receipt so the operator actually SEES what was paid
      // (previously the POS only printed silently, or did nothing).
      const tableNum = actionSheetTable?.table_number ?? activeOrders[0]?.table_number ?? '-';
      const receiptItems: { product_name: string; quantity: number; total_price: number }[] = [];
      let subtotal = 0;
      let discount = 0;
      let tip = 0;
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
        tip += Number(activeOrder.tip_amount) || 0;
        total += Number(activeOrder.total_amount) || 0;
      }
      setReceiptView({
        tableNumber: tableNum,
        orderId: activeOrders.map((o: any) => o.id).join(','),
        items: receiptItems,
        subtotal,
        discount,
        discountName: activeOrders[0]?.campaigns?.name,
        tip,
        total,
        paymentMethod: method,
        cashAmount: method === 'cash' ? total : 0,
        cardAmount: method === 'card' ? total : 0,
      });
      setReceiptTendered(method === 'cash' ? tenderedAmount : undefined);

      const settings = await getReceiptSettings();
      if (settings.autoPrintReceipt) {
        for (const activeOrder of activeOrders) {
          const items = (activeOrder.order_items || []).map((item: any) => ({
            name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
            quantity: item.quantity || 1,
            price: Number(item.total_price || item.price || 0),
          }));
          await printReceipt({
            restaurantName: settings.restaurantName,
            address: settings.address,
            receiptTitle: settings.receiptTitle,
            currency: settings.receiptCurrency,
            serviceFeePct: settings.serviceFeePct,
            showServiceFee: settings.showServiceFee,
            footerText: settings.footerText,
            tableNumber: activeOrder.table_number,
            orderId: activeOrder.id,
            items,
            subtotal: Number(activeOrder.total_amount) || 0,
            discount: Number(activeOrder.discount_amount) || 0,
            discountName: activeOrder.campaigns?.name,
            tip: 0,
            total: Number(activeOrder.total_amount) || 0,
            paymentMethod: method,
            cashAmount: method === 'cash' ? Number(activeOrder.total_amount) || 0 : 0,
            cardAmount: method === 'card' ? Number(activeOrder.total_amount) || 0 : 0,
            date: new Date().toISOString(),
            time: new Date().toISOString(),
            paperWidth: settings.paperWidth,
            copies: settings.copies,
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası');
    }
  };

  const handleSplitConfirm = async (split: { cash: string; card: string }) => {
    if (!actionSheetTable && posMode === 'dine_in') return;
    const cash = parseFloat(split.cash) || 0;
    const card = parseFloat(split.card) || 0;
    const tableNumbers = actionSheetGroup
      ? [actionSheetTable.table_number, ...(actionSheetGroup.children?.map((c: any) => c.table_number) || [])]
      : (actionSheetTable ? [actionSheetTable.table_number] : []);
    toast.loading('Ödəniş işlənir...', { id: 'action-toast' });
    try {
      const ordersRes = await apiFetch('/api/orders');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();
      let activeOrders = (ordersData.orders || []).filter((o: any) => 
        !['paid', 'cancelled', 'closed'].includes(o.status)
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
        toast.error('Ödəniləcək sifariş tapılmadı', { id: 'action-toast' });
        return;
      }
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
            tip_amount: 0,
            campaign_id: activeOrder.campaign_id || undefined,
            discount_amount: activeOrder.discount_amount || 0,
            discount_type: activeOrder.discount_type || 'fixed',
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          failedOrders.push(activeOrder.id);
          console.error(`Split payment failed for order ${activeOrder.id}:`, err);
        }
      }

      if (failedOrders.length > 0) {
        toast.error(`${failedOrders.length} sifariş ödənilərkən xəta baş verdi.`, { id: 'action-toast' });
        return;
      } else {
        toast.success('Bölünmüş ödəniş tamamlandı', { id: 'action-toast' });
      }

      setPaymentView(false);
      setActionSheetOpen(false);
      pos.fetchData();

      const settings = await getReceiptSettings();
      if (settings.autoPrintReceipt) {
        for (const activeOrder of activeOrders) {
          const items = (activeOrder.order_items || []).map((item: any) => ({
            name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
            quantity: item.quantity || 1,
            price: Number(item.total_price || item.price || 0),
          }));
          await printReceipt({
            restaurantName: settings.restaurantName,
            address: settings.address,
            receiptTitle: settings.receiptTitle,
            currency: settings.receiptCurrency,
            serviceFeePct: settings.serviceFeePct,
            showServiceFee: settings.showServiceFee,
            footerText: settings.footerText,
            tableNumber: activeOrder.table_number,
            orderId: activeOrder.id,
            items,
            subtotal: Number(activeOrder.total_amount) || 0,
            discount: Number(activeOrder.discount_amount) || 0,
            discountName: activeOrder.campaigns?.name,
            tip: 0,
            total: Number(activeOrder.total_amount) || 0,
            paymentMethod: 'split',
            cashAmount: Math.round(cash * ((Number(activeOrder.total_amount) || 0) / (grandTotal || 1)) * 100) / 100,
            cardAmount: Math.round(card * ((Number(activeOrder.total_amount) || 0) / (grandTotal || 1)) * 100) / 100,
            date: new Date().toISOString(),
            time: new Date().toISOString(),
            paperWidth: settings.paperWidth,
            copies: settings.copies,
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası');
    }
  };

  const handleDismissGroup = async () => {
    if (!actionSheetTable) return;
    toast.loading('Qrup boşaldılır...', { id: 'action-toast' });
    await pos.dismissTable(actionSheetTable.table_number);
    setActionSheetOpen(false);
    toast.success('Qrup boşaldıldı', { id: 'action-toast' });
  };

  const activeFloor = selectedFloor 
    ? pos.floors.find((f: any) => f.name === selectedFloor) 
    : pos.floors[0];

  // Active table counts per floor (for badge)
  const floorActiveCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of pos.floors) {
      counts[f.name] = (f.tables || []).filter((t: any) => 
        t.status !== 'empty' && !t.merged_into_table
      ).length;
    }
    return counts;
  }, [pos.floors]);

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

  const handleTableTap = (table: any) => {
    if (posMode !== 'dine_in') {
      toast.error('Bu rejimdə masa seçə bilməzsiniz. Sifarişi gel-al və ya çatdır rejimindəsiz.', { id: 'action-toast' });
      return;
    }

    if (table.status === 'empty' && !mergeMode && !transferMode) {
      pos.selectTable(table);
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
          toast.error('Boş masadan köçürmə edə bilməzsiniz');
          return;
        }
        setTransferSource(table.table_number);
        toast(`Mənbə: Masa ${table.table_number}. İndi hədəf seçin.`);
      } else if (table.table_number === transferSource) {
        toast.error('Eyni masanı seçdiz');
      } else {
        setTransferTarget(table.table_number);
        setTransferConfirm(true);
      }
      return;
    }

    pos.selectTable(table);
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
        toast.success('Masa köçürüldü');
        setTimeout(() => setLastUndo(null), 5000);
        setTransferMode(false);
        setTransferSource(null);
        setTransferTarget(null);
        // Refresh the floor so the moved table reflects new state, then make
        // sure the open cart (if any) follows the table. If the user had the
        // SOURCE table open, reopen the TARGET so the cart is rebuilt from the
        // transferred order instead of appearing lost on an now-empty table.
        await pos.fetchData();
        // Re-fetch floors after state update to avoid stale closure
        const freshFloorsRes = await apiFetch('/api/pos/tables');
        const freshFloors = freshFloorsRes.ok ? (await freshFloorsRes.json()).floors || [] : pos.floors;
        const allTables = freshFloors.flatMap((f: any) => f.tables || []);
        const openedSource = pos.selectedTable && pos.selectedTable.table_number === transferSource;
        if (openedSource) {
          const target = allTables.find((t: any) => t.table_number === targetTable);
          if (target) pos.selectTable(target);
        }
      } else {
        toast.error(data.error || 'Köçürmə uğursuz oldu');
        setTransferMode(false);
        setTransferSource(null);
        setTransferTarget(null);
      }
    } catch (e: any) {
      toast.error(e.message || 'Köçürmə xətası');
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
      toast.error('Rezervasiya ID tapılmadı');
      return;
    }
    try {
      const { data, error } = await supabase.rpc('seat_guests_atomic', {
        p_reservation_id: resId,
        p_performed_by: posSession?.staffId || null,
      });
      if (error) {
        toast.error(error.message || 'Qonaq gəlmədi');
        return;
      }
      if (data?.success) {
        toast.success('Qonaq gəldi — masa açıldı');
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
        toast.error('Qonaq gəlmədi');
      }
    } catch (e: any) {
      toast.error(e.message || 'Xəta');
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
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success('Köçürmə geri alındı');
          setLastUndo(null);
          pos.fetchData();
        } else {
          toast.error(data.error || 'Geri alınmadı');
        }
      } catch (e: any) {
        toast.error(e.message || 'Geri alma xətası');
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
          toast.success('Ayırma geri alındı');
          setLastUndo(null);
          pos.fetchData();
        } else {
          toast.error(data.error || 'Geri alınmadı');
        }
      } catch (e: any) {
        toast.error(e.message || 'Geri alma xətası');
      }
      return;
    }
    await pos.performUndo();
  };

  const handleUnmerge = async () => {
    if (!actionSheetTable) return;
    if (selectedForUnmerge.length === 0) {
      toast.error('Zəhmət olmasa ən azı bir masa seçin', { id: 'action-toast' });
      return;
    }
    try {
      const res = await apiFetch('/api/orders/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_table_number: actionSheetTable.table_number, child_table_numbers: selectedForUnmerge }),
      });
      const result = res.ok ? await res.json() : { error: (await res.json()).error || 'Xəta' };
      if (res.ok) {
        toast.success('Masalar ayrıldı', { id: 'action-toast' });
        setUnmergeMode(false);
        setSelectedForUnmerge([]);
        setActionSheetOpen(false);
        pos.fetchData();
        if (result.undo) {
          setLastUndo({
            action: 'unmerge',
            data: { ...result.undo, action: 'unmerge' },
            message: `Masa ${actionSheetTable.table_number} ayrıldı`,
            timestamp: Date.now(),
          });
          setTimeout(() => setLastUndo(null), 5000);
        }
      } else {
        toast.error(result.error || 'Ayırma uğursuz oldu', { id: 'action-toast' });
      }
    } catch (e: any) {
      toast.error(e.message || 'Ayırma xətası', { id: 'action-toast' });
    }
  };

  const actionSheetGroup = activeFloor?.merged_groups?.find((g: any) => 
    g.parent.table_number === actionSheetTable?.table_number
  );

  const handleOpenAction = (table: any) => {
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

  const handleCheckoutSubmit = async (checkoutData: {
    customer_phone: string;
    customer_name: string;
    customer_note: string;
    delivery_address: string;
    delivery_district: string;
    delivery_street: string;
    delivery_building: string;
    delivery_floor: string;
    delivery_apartment: string;
    delivery_intercom: string;
    delivery_zone: string;
    delivery_fee: number;
    estimated_pickup_time: string;
    scheduled_date: string;
    payment_method: string;
  }) => {
    if (!pos.cart || pos.cart.items.length === 0) {
      toast.error('Səbət boşdur');
      return;
    }

    // Also update cart for UI consistency (non-blocking)
    pos.setCart({
      ...pos.cart,
      customer_phone: checkoutData.customer_phone || null,
      customer_name: checkoutData.customer_name || null,
      notes: checkoutData.customer_note || '',
      delivery_address: checkoutData.delivery_address || null,
      delivery_district: checkoutData.delivery_district || null,
      delivery_street: checkoutData.delivery_street || null,
      delivery_building: checkoutData.delivery_building || null,
      delivery_floor: checkoutData.delivery_floor || null,
      delivery_apartment: checkoutData.delivery_apartment || null,
      delivery_intercom: checkoutData.delivery_intercom || null,
      delivery_zone: checkoutData.delivery_zone || null,
      delivery_fee: checkoutData.delivery_fee || 0,
      estimated_delivery_time: checkoutData.estimated_pickup_time || null,
      scheduled_date: checkoutData.scheduled_date || null,
    });

    setCheckoutOpen(false);

    // Pass checkout data directly to placeOrder to avoid React state race condition
    const autoCampaign = pos.getAutoCampaign(pos.cart);
    await pos.placeOrder(autoCampaign ? { id: autoCampaign.id, type: 'AUTO' } : undefined, {
      customer_phone: checkoutData.customer_phone,
      customer_name: checkoutData.customer_name,
      customer_note: checkoutData.customer_note,
      delivery_address: checkoutData.delivery_address,
      delivery_district: checkoutData.delivery_district,
      delivery_street: checkoutData.delivery_street,
      delivery_building: checkoutData.delivery_building,
      delivery_floor: checkoutData.delivery_floor,
      delivery_apartment: checkoutData.delivery_apartment,
      delivery_intercom: checkoutData.delivery_intercom,
      delivery_zone: checkoutData.delivery_zone,
      delivery_fee: checkoutData.delivery_fee,
      estimated_delivery_time: checkoutData.estimated_pickup_time,
      payment_method: checkoutData.payment_method,
    }, posSession?.staffId);

    // Process payment
    // (payment will be handled after order is placed - order goes to kitchen first)
    // For takeaway: order status = confirmed, kitchen picks it up
    // For delivery: order status = pending, kitchen prepares
  };

  const handleOpenCheckout = () => {
    if (!pos.cart || pos.cart.items.length === 0) {
      toast.error('Əvvəlcə məhsul əlavə edin');
      return;
    }
    setCheckoutOpen(true);
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      {/* Loading state while session is being validated */}
      {!posSession && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <p className="text-xs text-white/30 font-bold uppercase tracking-widest">Yüklənir...</p>
          </div>
        </div>
      )}

      {/* MODE SWITCHER — always visible */}
      <div className="flex items-center gap-4 px-6 pt-4 pb-2">
          <h1 className="text-2xl font-black tracking-tighter">POS</h1>
          <button
            onClick={() => {
              // Toggle sidebar via dispatching a custom event
              window.dispatchEvent(new CustomEvent('pos-toggle-sidebar'));
            }}
            className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            title="Menyu"
          >
            <PanelLeftClose size={16} />
          </button>
          <div className={`flex items-center gap-1 rounded-full p-1 ${lightMode ? 'bg-zinc-100' : 'bg-white/5'}`}>
            {([
              { mode: 'dine_in' as const, icon: Utensils, label: 'İçəridə', activeBg: lightMode ? '#171717' : '#ffffff', activeText: lightMode ? '#ffffff' : '#000000', innerColor: '#10b981' },
              { mode: 'takeaway' as const, icon: UserCheck, label: 'Gel-Al', activeBg: lightMode ? '#171717' : '#ffffff', activeText: lightMode ? '#ffffff' : '#000000', innerColor: '#3b82f6' },
              { mode: 'delivery' as const, icon: Bike, label: 'Çatdır', activeBg: lightMode ? '#171717' : '#ffffff', activeText: lightMode ? '#ffffff' : '#000000', innerColor: '#3b82f6' },
            ]).map(({ mode, icon: Icon, label, activeBg, activeText, innerColor }) => (
              <button
                key={mode}
                onClick={() => {
                  setPosMode(mode);
                  pos.setActiveView('floor');
                }}
                className="relative flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-colors z-10"
                style={{ color: posMode === mode ? activeText : lightMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}
              >
                {posMode === mode && (
                  <motion.div
                    layoutId="activeModeTab"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-full z-0"
                    style={{ backgroundColor: activeBg }}
                  />
                )}
                <div className="relative z-10 w-2 h-2 rounded-full" style={{ backgroundColor: innerColor }} />
                <Icon size={14} className="relative z-10" style={posMode === mode ? { color: activeText } : undefined} />
                <span className="relative z-10">{label}</span>
              </button>
            ))}
          </div>
          {pos.floors.length > 1 && posMode === 'dine_in' && (
            <LiquidDropdown
              options={pos.floors.map((f: any) => ({ id: f.name, label: f.name, badge: floorActiveCounts[f.name] || 0 }))}
              activeId={activeFloor?.name}
              onChange={setSelectedFloor}
            />
          )}
          <div className="flex-1" />
          <button
            onClick={() => setOrderHistoryOpen(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            title="Sifariş Tarixçəsi"
          >
            <History size={16} />
            <span className="hidden sm:inline">Tarixçə</span>
          </button>
          {isCashierOrAdmin && (
            <button
              onClick={() => setCashDrawerOpen(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              title="Kassa / Smena"
            >
              <Wallet size={16} />
              <span className="hidden sm:inline">Kassa</span>
            </button>
          )}
          <button
            onClick={() => setLightMode(!lightMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
          >
            {lightMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {posSession && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/30 hidden sm:inline">{posSession.name}</span>
              <button
                onClick={handlePosLogout}
                className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
                title="Çıxış"
              >
                <X size={14} />
              </button>
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
                <div key="floor" className="h-full flex flex-col p-6">
                {cleanMode && (
                  <button
                    onClick={() => {
                      if (document.fullscreenElement) document.exitFullscreen();
                      setCleanMode(false);
                    }}
                    className="fixed top-4 left-4 z-50 p-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-all"
                    title="Geri"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                  </button>
                )}
                {!cleanMode && (
                <div>
                    <div className="flex items-center justify-end gap-3 mb-6">
                     <button
                       onClick={() => router.push('/admin/reservations')}
                       className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                       title="Rezervasiyalar"
                     >
                       <Calendar size={16} />
                       <span className="hidden sm:inline">Rezervasiyalar</span>
                     </button>
                     <button
                       onClick={() => setWalkInOpen(true)}
                       className="flex items-center gap-2 px-3 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-wider hover:bg-amber-500/20 transition-all"
                     >
                       <span>+</span>
                       <span className="hidden sm:inline">Walk In</span>
                     </button>
          <div className={`flex items-center gap-1 rounded-full p-1 ${lightMode ? 'bg-zinc-100' : 'bg-zinc-800'}`}>
                        {[
                          { active: !mergeMode && !transferMode, label: 'Normal' },
                          { active: mergeMode, label: 'Birləşdir' },
                          { active: transferMode, label: 'Köçür' },
                        ].map(({ active, label }) => (
                          <button
                            key={label}
                            onClick={() => {
                              if (label === 'Normal') { setMergeMode(false); setTransferMode(false); setSelectedForMerge([]); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); setActionSheetOpen(false); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                              if (label === 'Birləşdir') { setMergeMode(true); setTransferMode(false); setSelectedForMerge([]); setActionSheetOpen(false); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                              if (label === 'Köçür') { setMergeMode(false); setTransferMode(true); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); setActionSheetOpen(false); setPaymentView(false); setUnmergeMode(false); setSelectedForUnmerge([]); }
                            }}
                            className="relative px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors z-10"
                            style={{ color: active ? (lightMode ? '#ffffff' : '#ffffff') : lightMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)' }}
                          >
                           {active && (
                             <motion.div
                               layoutId="activeActionTab"
                               transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                               className="absolute inset-0 rounded-full z-0 bg-blue-500"
                             />
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
                       title="Tam Ekran"
                     >
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                       </svg>
                     </button>
                  </div>
                   </div>
               )}

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
                         const targetTable = prompt('Hədəf masa nömrəsini daxil edin:');
                         if (!targetTable) return;
                         const targetNum = parseInt(targetTable, 10);
                         if (isNaN(targetNum)) {
                           toast.error('Yanlış masa nömrəsi');
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
                             toast.success(`Masa ${reservationArrival.table_number} → ${targetNum} köçürüldü`);
                             pos.fetchData();
                           } else {
                             const err = await res.json().catch(() => ({ error: 'Xəta' }));
                             toast.error(err.error || 'Köçürülə bilmədi');
                           }
                         } catch {
                           toast.error('Köçürülə bilmədi');
                         }
                       }
                     }}
                     onMergeTable={async () => {
                       setReservationArrival(null);
                       if (reservationArrival && reservationArrival.reservation_id) {
                         const extraTables = prompt('Birləşdirmək istədiyiniz masaları vergül ilə ayıraraq daxil edin (məs: 5,6,7):');
                         if (!extraTables) return;
                         const tableNums = extraTables.split(',').map((t) => parseInt(t.trim(), 10)).filter((n) => !isNaN(n));
                         if (tableNums.length === 0) {
                           toast.error('Yanlış masa nömrələri');
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
                             toast.success('Masalar birləşdirildi');
                             pos.fetchData();
                           } else {
                             const err = await res.json().catch(() => ({ error: 'Xəta' }));
                             toast.error(err.error || 'Birləşdirilə bilmədi');
                           }
                         } catch {
                           toast.error('Birləşdirilə bilmədi');
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
                             toast.success('Rezervasiya ləğv edildi');
                             pos.fetchData();
                           } else {
                             toast.error('Ləğv edilə bilmədi');
                           }
                         } catch {
                           toast.error('Ləğv edilə bilmədi');
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
                             toast.success('No Show qeyd edildi');
                             pos.fetchData();
                           } else {
                             toast.error('No Show edilə bilmədi');
                           }
                         } catch {
                           toast.error('No Show edilə bilmədi');
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
                         toast.success('Bilet çap edildi');
                       } catch (e: any) {
                         toast.error(e.message || 'Çap xətası');
                       }
                     }}
                   />
                 )}

                <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {visibleTables?.map((table: any) => {
                    const groupInfo = tableGroupInfo[table.table_number];
                    const isGroup = groupInfo && groupInfo.children.length > 0;
                    
                    return (
                      <div
                        key={table.table_number}
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
                      />
                      </div>
                    );
                  })}
                </div>
               </div>
            </div>
          )}

          {/* TAKEAWAY: Active orders list — renders instantly, own internal loading */}
          {posMode === 'takeaway' && pos.activeView === 'floor' && (
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
          )}

          {/* DELIVERY: Active orders list — renders instantly, own internal loading */}
          {posMode === 'delivery' && pos.activeView === 'floor' && (
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
          )}

           {/* ORDER VIEW: ProductGrid + CartPanel — works for ALL modes */}
           {pos.activeView === 'order' && pos.loading && (
             <div key="order-skeleton" className="h-full w-full flex flex-col md:flex-row overflow-hidden">
                <div className="flex-1 p-6 overflow-hidden"><ProductGridSkeleton /></div>
                <div className="w-full md:w-[400px] border-l p-6 bg-black/20"><CartSkeleton /></div>
             </div>
           )}
           {pos.activeView === 'order' && !pos.loading && (
             <div key="order" className="h-full w-full flex flex-col overflow-hidden">
                 {/* ═══════════════════════════════════════════════ */}
                 {/* SİFARİŞ — ProductGrid + CartPanel                */}
                 {/* ═══════════════════════════════════════════════ */}
                  <div className="flex-1 flex flex-row overflow-hidden min-h-0">
                    <div className="flex-1 p-6 overflow-y-auto min-h-0">
                      <ProductGrid
                        products={pos.products}
                        categories={pos.categories}
                        combos={pos.combos}
                        onAddProduct={(p) => handleProductTap(p)}
                        onAddCombo={(c) => pos.addComboToCart(c)}
                        cartCounts={(pos.cart?.items ?? []).reduce((acc: Record<string, number>, item: any) => {
                          const id = item.product_id;
                          acc[id] = (acc[id] || 0) + (item.quantity || 0);
                          return acc;
                        }, {})}
                        outOfStock={new Set((pos.products ?? []).filter((p: any) => p.is_in_stock === false || p.is_available === false).map((p: any) => p.id))}
                      />
                    </div>
                    <div className="w-[400px] flex-shrink-0 border-l flex flex-col overflow-hidden min-h-0">
                       {posMode !== 'dine_in' && (
                         <div className="flex-shrink-0 overflow-y-auto min-h-0 max-h-[44%] px-4 pt-3 pb-2 space-y-2.5 border-b border-black/5 dark:border-white/10">
                           {editingOrder && (
                             <div className="flex items-center justify-between gap-2">
                               <div className="min-w-0">
                                 <p className={`text-base font-black tracking-tight truncate ${lightMode ? 'text-black' : 'text-white'}`}>
                                   {posMode === 'takeaway' ? `Gel-Al ${editingOrder.order_number || ''}` : `Çatdırılma ${editingOrder.order_number || ''}`}
                                 </p>
                                 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border mt-0.5 ${
                                   editingOrder.status === 'paid' ? 'bg-green-500/15 border-green-500/25 text-green-400' :
                                   editingOrder.status === 'cancelled' ? 'bg-red-500/15 border-red-500/25 text-red-400' :
                                   'bg-amber-500/15 border-amber-500/25 text-amber-400'
                                 }`}>
                                   {editingOrder.status === 'paid' ? 'Ödənildi' : editingOrder.status === 'cancelled' ? 'Ləğv' : editingOrder.status === 'confirmed' ? 'Təsdiqləndi' : editingOrder.status === 'preparing' ? 'Hazırlanır' : editingOrder.status === 'ready' ? 'Hazırdır' : editingOrder.status}
                                 </span>
                               </div>
                               {editingOrder.status !== 'paid' && editingOrder.status !== 'cancelled' && (
                                 <div className="flex flex-col gap-1 shrink-0">
                                   {editingOrder.status === 'confirmed' && (
                                     <button onClick={() => handleDeliveryStatusUpdate('preparing', editingOrder.id)} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-amber-600 active:scale-95 transition-all">
                                       Hazırlanır
                                     </button>
                                   )}
                                   {editingOrder.status === 'preparing' && (
                                     <button onClick={() => handleDeliveryStatusUpdate('ready', editingOrder.id)} className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-green-600 active:scale-95 transition-all">
                                       Hazırdır
                                     </button>
                                   )}
                                   {(editingOrder.status === 'ready' || editingOrder.status === 'delivered') && (
                                     <button onClick={() => handleDeliveryStatusUpdate('paid', editingOrder.id)} className="px-3 py-1.5 rounded-lg bg-gold text-black text-[10px] font-black uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all">
                                       Ödəniş Al
                                     </button>
                                   )}
                                 </div>
                               )}
                             </div>
                           )}

                           <div className="grid grid-cols-2 gap-2">
                             <div>
                               <label className={`text-[8px] font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                 Telefon {posMode === 'delivery' ? '*' : ''}
                               </label>
                               <input
                                 type="tel"
                                 value={pos.cart?.customer_phone || ''}
                                 onChange={e => {
                                   if (!pos.cart) return;
                                   pos.setCart({ ...pos.cart, customer_phone: e.target.value || null });
                                 }}
                                 placeholder="050 200 12 20"
                                 className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                               />
                             </div>
                             <div>
                               <label className={`text-[8px] font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                 Ad Soyad
                               </label>
                               <input
                                 type="text"
                                 value={pos.cart?.customer_name || ''}
                                 onChange={e => {
                                   if (!pos.cart) return;
                                   pos.setCart({ ...pos.cart, customer_name: e.target.value || null });
                                 }}
                                 placeholder="Müştəri adı"
                                 className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                               />
                             </div>
                           </div>

                           {posMode === 'delivery' && (
                             <div>
                               <label className={`text-[8px] font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                 Çatdırma Ünvanı *
                               </label>
                               <textarea
                                 value={pos.cart?.delivery_address || ''}
                                 onChange={e => {
                                   if (!pos.cart) return;
                                   pos.setCart({ ...pos.cart, delivery_address: e.target.value || null });
                                 }}
                                 placeholder="Ünvan daxil edin"
                                 rows={2}
                                 className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all resize-none ${lightMode ? 'bg-white border-black/10 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                               />
                             </div>
                           )}

                           <div className="grid grid-cols-2 gap-2">
                             {posMode === 'delivery' && (
                               <div>
                                 <label className={`text-[8px] font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                   Çatdırma Haqqı (₼)
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
                                   className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                                 />
                               </div>
                             )}
                             <div>
                               <label className={`text-[8px] font-black uppercase tracking-[0.2em] mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                 Qeyd
                               </label>
                               <input
                                 type="text"
                                 value={pos.cart?.notes || ''}
                                 onChange={e => {
                                   if (!pos.cart) return;
                                   pos.setCart({ ...pos.cart, notes: e.target.value });
                                 }}
                                 placeholder="Əlavə qeyd..."
                                 className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                               />
                             </div>
                           </div>
                         </div>
                       )}
                       <CartPanel
                          cart={pos.cart}
                          onPlaceOrder={() => {
                            if (pos.reservationMode) {
                              pos.savePreOrder();
                              return;
                            }
                            if (posMode !== 'dine_in') {
                              const phone = pos.cart?.customer_phone?.trim();
                              if (posMode === 'delivery' && !phone) {
                                toast.error('Telefon nömrəsi daxil edin');
                                return;
                              }
                              if (posMode === 'delivery' && !pos.cart?.delivery_address?.trim()) {
                                toast.error('Çatdırma ünvanı daxil edin');
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
                          }}
                         onBack={() => { pos.setActiveView('floor'); setEditingOrder(null); }}
                         orderButtonStatus={pos.placingOrder ? 'loading' : 'idle'}
                         onUpdateQty={(idx, delta) => pos.updateCartItemQty(idx, delta)}
                         onUpdateGuests={(delta) => pos.updateGuestCount(delta)}
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
                         isDirty={(pos.cart?.items ?? []).some(i => (i.sentQuantity ?? 0) === 0 && i.quantity > 0)}
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
                           if (product) setModalProduct({ product, variants: pos.variantsByProduct[productId] || [] });
                         }}
                       />
                    </div>
                  </div>
             </div>
           )}
          </AnimatePresence>

      {/* CHECKOUT MODAL for Takeaway/Delivery */}
      {checkoutOpen && (
        <CheckoutModal
          open={checkoutOpen}
          mode={posMode === 'delivery' ? 'delivery' : 'takeaway'}
          total={(pos.cart?.items ?? []).reduce((s: number, i: any) => s + (i.total_price || 0), 0) + (posMode === 'delivery' ? (pos.cart?.delivery_fee || 0) : 0)}
          onSubmit={handleCheckoutSubmit}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
  
          <ActionSheet
           table={actionSheetTable} 
           open={actionSheetOpen || paymentView} 
            onClose={() => { setActionSheetOpen(false); setUnmergeMode(false); setPaymentView(false); setTransferMode(false); setTransferSource(null); setTransferTarget(null); }} 
          onAddOrder={() => { pos.selectTable(actionSheetTable); setActionSheetOpen(false); }}
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
          onDeliveryStatus={() => { if (actionSheetTable) handleDeliveryStatusUpdate('confirmed'); }}
          onTakeawayStatus={handleTakeawayStatusAdvance}
         onCancelTable={async () => {
           if (!actionSheetTable) return;
           if (posMode === 'takeaway' || posMode === 'delivery') {
             try {
               const res = await apiFetch('/api/orders/delivery-status', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ order_id: actionSheetTable.id, status: 'cancelled' }),
               });
               if (res.ok) {
                 toast.success('Sifariş ləğv edildi');
                 pos.fetchData();
               } else {
                 toast.error('Ləğv edilə bilmədi');
               }
             } catch {
               toast.error('Xəta baş verdi');
             }
           } else {
             pos.dismissTable(actionSheetTable.table_number);
           }
           setActionSheetOpen(false);
         }}
         onDismissGroup={handleDismissGroup}
         paymentView={paymentView}
         mergeMode={mergeMode}
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
            const undoResult = await pos.mergeTables(selectedForMerge); 
            if (undoResult) setLastUndo({ ...undoResult, timestamp: Date.now() });
            setTimeout(() => setLastUndo(null), 5000);
            setMergeMode(false); 
            setSelectedForMerge([]); 
          }}
          onBillRequest={handleBillRequest}
          onPrintBill={handlePrintBill}
          onClearTable={() => { if (actionSheetTable) { pos.clearTable(actionSheetTable.table_number); setActionSheetOpen(false); } }}
          posRole={posRole}
            groupNumber={actionSheetTable ? tableGroupInfo[actionSheetTable.table_number]?.groupNum : undefined}
             customerId={pos.cart?.customer_id}
            customerName={pos.cart?.customer_name}
            onSelectCustomer={(customerId, customerName) => {
              pos.updateCartCustomer(customerId, customerName);
            }}
            posMode={posMode}
            transferConfirm={transferConfirm}
            transferSource={transferSource}
            transferTarget={transferTarget}
            onConfirmTransfer={() => { if (transferTarget) handleConfirmTransfer(transferTarget); setTransferConfirm(false); }}
            onCancelTransfer={() => { setTransferConfirm(false); setTransferMode(false); setTransferSource(null); setTransferTarget(null); }}
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
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-6 px-8 py-4 rounded-[2rem] bg-zinc-900 text-white shadow-2xl border border-white/10">
            <span className="text-sm font-bold">{lastUndo.message}</span>
            <button onClick={handleUndo} className="px-6 py-2.5 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95">Geri Al</button>
          </motion.div>
        )}
      </AnimatePresence>

      <ModifierSheet
        open={!!modalProduct}
        productName={modalProduct?.product.name || ''}
        productPrice={modalProduct?.product.price || 0}
        variants={modalProduct?.variants || []}
        onClose={() => setModalProduct(null)}
        onConfirm={(_modifiers, notes, variantId) => {
          if (modalProduct) {
            pos.addToCart(modalProduct.product, { variantId: variantId || null, notes });
          }
          setModalProduct(null);
        }}
      />

      <AnimatePresence>
        {receiptView && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
            onClick={() => { setReceiptView(null); setReceiptTendered(undefined); }}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="bg-white rounded-2xl p-4 shadow-2xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <ReceiptPreview
                title="SİFARİŞ ÇEKİ"
                tableNumber={receiptView.tableNumber}
                items={receiptView.items}
                showServiceFee={false}
                serviceFeePct={0}
                currency="₼"
                discountAmount={receiptView.discount}
                campaignName={receiptView.discountName || undefined}
              />
              <div className="mt-4 text-center text-[11px] text-zinc-500">
                {receiptView.paymentMethod === 'cash' ? 'Nağd' : receiptView.paymentMethod === 'card' ? 'Kart' : receiptView.paymentMethod}
                {' · '}
                {receiptView.total.toFixed(2)} ₼
              </div>

              {/* Verilən pul və qalıq — yalnız nağd ödənişdə */}
              {receiptTendered != null && receiptTendered > 0 && receiptView.paymentMethod === 'cash' && (
                <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-emerald-600">Verilən:</span>
                    <span className="tabular-nums">{receiptTendered.toFixed(2)} ₼</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-emerald-600">Hesab:</span>
                    <span className="tabular-nums">{receiptView.total.toFixed(2)} ₼</span>
                  </div>
                  <div className="h-px bg-emerald-200 my-1" />
                  <div className="flex justify-between text-sm font-black">
                    <span className="text-emerald-700">Qalıq:</span>
                    <span className="text-emerald-600 tabular-nums">
                      {receiptTendered >= receiptView.total
                        ? `${(receiptTendered - receiptView.total).toFixed(2)} ₼`
                        : `-${(receiptView.total - receiptTendered).toFixed(2)} ₼`}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => { setReceiptView(null); setReceiptTendered(undefined); }}
                className="mt-4 w-full py-3 rounded-2xl bg-zinc-900 text-white text-xs font-black uppercase tracking-widest hover:bg-zinc-700 transition-all active:scale-95"
              >
                Bağla
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bill Request Notification Popup — kassirə görsənir */}
      <AnimatePresence>
        {billNotify && (Date.now() - billNotify.time < 5000) && isCashierOrAdmin && (
          <motion.div
            key={`bill-notify-${billNotify.time}`}
            initial={{ opacity: 0, y: -40, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -40, x: '-50%' }}
            className="fixed top-20 left-1/2 z-[130] bg-rose-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-rose-500/40 flex items-center gap-3 cursor-pointer"
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setWalkInOpen(false)}
          >
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-sm rounded-3xl p-7 shadow-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
            >
              <p className={`text-xl font-black tracking-tight mb-1 ${lightMode ? 'text-black' : 'text-white'}`}>Walk In</p>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-5 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Masa nömrəsi və qonaq sayı</p>
              <div className="space-y-3 mb-6">
                <div>
                  <label className={`text-[9px] font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Masa №</label>
                  <input type="number" min="1" value={walkInTable} onChange={e => setWalkInTable(e.target.value)} autoFocus
                    className={`w-full rounded-2xl px-5 py-3 text-lg font-bold outline-none border ${lightMode ? 'bg-zinc-50 border-zinc-200 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                  />
                </div>
                <div>
                  <label className={`text-[9px] font-black uppercase tracking-widest mb-1 block ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Qonaq sayı</label>
                  <input type="number" min="1" value={walkInGuests} onChange={e => setWalkInGuests(e.target.value)}
                    className={`w-full rounded-2xl px-5 py-3 text-lg font-bold outline-none border ${lightMode ? 'bg-zinc-50 border-zinc-200 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setWalkInOpen(false)} className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-wider border ${lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                  Ləğv
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
                        body: JSON.stringify({ table_number: tableNum, guests }),
                      });
                      if (res.ok) { toast.success(`Masa ${tableNum} — walk-in`); pos.fetchData(); }
                      else { const err = await res.json(); toast.error(err.error || 'Walk-in uğursuz'); }
                    } catch { toast.error('Xəta'); }
                    setWalkInOpen(false); setWalkInTable(''); setWalkInGuests('1');
                  }}
                  disabled={!walkInTable || Number(walkInTable) < 1}
                  className="flex-1 py-4 rounded-2xl bg-amber-500 text-white text-xs font-black uppercase tracking-wider hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-30 shadow-lg shadow-amber-500/20"
                >
                  Təsdiqlə
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
