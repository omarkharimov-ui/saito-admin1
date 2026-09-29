'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Printer, X, ChevronLeft, Search, CalendarDays, RefreshCw, Split, Receipt, User, Users, Wallet, CreditCard, Package, PackageOpen, Car, Utensils, AlertTriangle, ChevronRight, Minus, Handbag } from '@/components/ui/saito-icons';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { printReceipt, getReceiptSettings } from '@/lib/print/PrintService';
import { fastExit, slideUp, centerModal } from '@/lib/modal-transitions';
import { T, EASE, SPRING } from '@/lib/motion/system';
import { PinGuard } from './PinGuard';
import { requiresPin } from '@/lib/pos-permissions';
import { toast } from '@/lib/toast';

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  variant_id: string | null;
  variant_name: string | null;
  modifiers: string | any[];
  special_notes: string | null;
  combo_group_id: string | null;
  is_combo_parent: boolean;
  parent_order_item_id: string | null;
  kitchen_status: string | null;
  served_quantity: number | null;
  prepared_quantity: number | null;
  seat_number: number | null;
  course: string | null;
  products?: { name_az?: string; name_en?: string };
}

interface PaidOrder {
  id: string;
  table_number: number | null;
  order_number: string | null;
  order_source: string | null;
  order_type: string | null;
  total_amount: number;
  subtotal: number | null;
  paid_amount: number | null;
  cash_amount: number | null;
  card_amount: number | null;
  tip_amount: number | null;
  refund_amount: number | null;
  discount_amount: number | null;
  discount_type: string | null;
  campaign_id: string | null;
  payment_method: string | null;
  status: string;
  guest_count: number | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_note: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  order_items: OrderItem[];
}

interface PaymentRecord {
  id: string;
  method: string | null;
  payment_method: string | null;
  amount: number;
  currency: string | null;
  status: string | null;
  is_refund: boolean;
  is_partial: boolean;
  reference: string | null;
  split_group_id: string | null;
  created_at: string;
}

interface AuditLog {
  id: string;
  action: string;
  reason: string | null;
  staff_name: string | null;
  performed_by: string | null;
  details: any;
  old_data: any;
  new_data: any;
  created_at: string;
}

interface OrderDetailData {
  order: PaidOrder;
  payments: PaymentRecord[];
  auditLogs: AuditLog[];
}

interface OrderHistoryProps {
  open: boolean;
  onClose: () => void;
  posRole?: string | null;
}

export function OrderHistory({ open, onClose, posRole }: OrderHistoryProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const hasLoadedOnce = useRef(false); // stale-while-revalidate gate (Task 2)
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [reprinting, setReprinting] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // 2026-09-27 (E2E: header rows were stacked 5-deep and the 2nd filter row
  // clipped into the search field): the date range is now COLLAPSED behind a
  // calendar toggle, and the two filter rows merged into one.
  const [dateOpen, setDateOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // 2026-09-23 (owner, Toast/Square benchmark): before this, ONLY paid orders
  // were visible — voided/refunded orders could not be audited from the POS.
  const [statusFilter, setStatusFilter] = useState<'paid' | 'refunded' | 'cancelled' | 'all'>('paid');
  const [sheetTab, setSheetTab] = useState<'orders' | 'exceptions'>('orders');
  // 2026-09-27 (owner pick): the 3-card-variant review is DONE — variant 1
  // ("Clean list") won and is now the ONLY order card; variants 2/3 and the
  // temporary 1/2/3 header switcher were removed this round.
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exceptions, setExceptions] = useState<{ id: string; action: string; order_ref: string | null; reason: string | null; staff_name: string | null; created_at: string }[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [pinGuardOpen, setPinGuardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ fn: () => void; action: string } | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<PaidOrder | null>(null);
  const [detailData, setDetailData] = useState<OrderDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<PaidOrder | null>(null);

  const buildParams = useCallback((offset: number) => {
    const params = new URLSearchParams({ status: statusFilter, limit: '100', offset: String(offset) });
    // AUDIT 2026-09-23: the date filter must span LOCAL days (Baku UTC+4),
    // not UTC days — send the browser offset so the route can bound correctly.
    params.set('tz_offset_min', String(-new Date().getTimezoneOffset()));
    if (filter !== 'all') params.set('order_source', filter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    return params;
  }, [statusFilter, filter, dateFrom, dateTo]);

  const fetchOrders = useCallback(async () => {
    // 2026-09-27 (owner: "Tarixçə çox gec açılır") — STALE-WHILE-REVALIDATE:
    // only the very first load gates on a spinner; re-opens / filter changes
    // show the cached list immediately and refresh in the background.
    if (!hasLoadedOnce.current) setLoading(true);
    hasLoadedOnce.current = true;
    setLoadedCount(0);
    try {
      const res = await apiFetch(`/api/orders/history?${buildParams(0)}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setLoadedCount(data.orders?.length || 0);
        setTotalCount(data.totalCount || 0);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [buildParams]);

  // 2026-09-23: "load more" — the old list was hard-capped at 100 orders.
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/orders/history?${buildParams(loadedCount)}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(prev => [...prev, ...(data.orders || [])]);
        setLoadedCount(prev => prev + (data.orders?.length || 0));
        setTotalCount(data.totalCount || 0);
      }
    } catch { /* silent */ }
    setLoadingMore(false);
  }, [buildParams, loadedCount]);

  const fetchExceptions = useCallback(async () => {
    setExceptionsLoading(true);
    try {
      const params = new URLSearchParams({});
      params.set('tz_offset_min', String(-new Date().getTimezoneOffset()));
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiFetch(`/api/orders/history/exceptions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setExceptions(data.exceptions || []);
      }
    } catch { /* silent */ }
    setExceptionsLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (open) {
      fetchOrders();
      fetchExceptions();
    }
  }, [open, fetchOrders, fetchExceptions]);

  /* 2026-09-27 (owner: "modal girişi zamani bug var" — E2E reproduced):
     first open showed "0 sifariş" + a ~1s spinner (cold pooler) and then
     ALL rows popped in at once. Prefetch the default view ONCE on mount —
     the same stale-while-revalidate doctrine as the Kassa modal — so the
     FIRST open already has data and paints instantly; later opens
     revalidate in the background behind the stale paint. */
  const mountPrefetched = useRef(false);
  useEffect(() => {
    if (mountPrefetched.current) return;
    mountPrefetched.current = true;
    void fetchOrders();
    void fetchExceptions();
  }, [fetchOrders, fetchExceptions]);

  const fetchOrderDetail = useCallback(async (order: PaidOrder) => {
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await apiFetch(`/api/orders/history/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      } else {
        setDetailData({ order, payments: [], auditLogs: [] });
      }
    } catch {
      setDetailData({ order, payments: [], auditLogs: [] });
    }
    setDetailLoading(false);
  }, []);

  const handleSelectOrder = (order: PaidOrder) => {
    setSelectedOrder(order);
    setAuditExpanded(false);
    fetchOrderDetail(order);
  };

  const handleBackToList = () => {
    setSelectedOrder(null);
    setDetailData(null);
  };

  // 2026-09-27 (owner pick, variant 1 of the 3-way review) — "Clean list"
  // order card: no card fills, hairline separators, round source glyph,
  // title + meta left, amount + ghost reprint right. Tap → detail.
  const renderOrderCard = (order: PaidOrder) => {
    const isDine = !!order.table_number;
    const src = order.order_source || 'dine_in';
    const srcLabel = src === 'takeaway' ? t('takeaway') : src === 'delivery' ? t('delivery') : t('dine_in');
    const title = isDine
      ? `${t('table_label')} ${order.table_number}`
      : src === 'takeaway' ? `${t('takeaway_short')} ${order.order_number || ''}`
      : src === 'delivery' ? `${t('delivery_short')} ${order.order_number || ''}`
      : `#${order.order_number || order.id.slice(0, 8)}`;
    const time = new Date(order.created_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' });
    const date = new Date(order.created_at).toLocaleDateString('az');
    const total = `₼${(Number(order.paid_amount || order.total_amount) || 0).toFixed(2)}`;
    const guests = order.guest_count ? ` · ${order.guest_count} nəfər` : '';
    // 2026-09-29 (owner, round 7 #6): takeaway icon = Handbag — the person
    // PICKING UP the order carries a bag. ShoppingBag reads as a box at small
    // sizes; Handbag (trapezoid + handle) is unambiguously a bag. Same icon
    // language as the POS header tab switcher (Utensils/Handbag/Bike).
    const Icon = src === 'takeaway' ? Handbag : src === 'delivery' ? Car : Utensils;
    // 2026-09-28 (owner: light mode — yalnız mavi/qara): takeaway = qara
    const iconWrap = src === 'takeaway'
      ? (lightMode ? 'bg-zinc-900/10 text-zinc-900' : 'bg-amber-500/15 text-amber-400')
      : src === 'delivery'
        ? (lightMode ? 'bg-blue-500/10 text-blue-600' : 'bg-blue-500/15 text-blue-400')
        : (lightMode ? 'bg-emerald-500/10 text-emerald-600' : 'bg-emerald-500/15 text-emerald-400');
    const meta = lightMode ? 'text-zinc-400' : 'text-white/35';
    const reprintBtn = (
      <button
        onClick={(e) => { e.stopPropagation(); guardAction(() => doReprint(order), 'reprint'); }}
        disabled={reprinting === order.id}
        className={`p-2 rounded-full flex-shrink-0 transition-all active:scale-90 disabled:opacity-30 ${lightMode ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600' : 'text-white/35 hover:bg-white/10 hover:text-white/70'}`}
        title={t('reprint')}
      >
        {reprinting === order.id ? (
          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Printer size={13} />
        )}
      </button>
    );

    // V1 — "Clean list" (Apple history style): no card fills, hairline
    // separators, round source glyph, title + meta left, amount right.
    return (
      <div
        key={order.id}
        onClick={() => handleSelectOrder(order)}
        className={`flex items-center gap-3 px-2 py-3 rounded-xl cursor-pointer select-none transition-colors border-b last:border-0 ${lightMode ? 'border-zinc-100 hover:bg-zinc-50' : 'border-white/[0.06] hover:bg-white/[0.03]'}`}
      >
        <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
          <Icon size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold truncate leading-tight">{title}</p>
          <p className={`text-[11px] font-bold tabular-nums truncate mt-0.5 ${meta}`}>{date} · {time}{guests}</p>
        </div>
        <span className="text-[13px] font-black tabular-nums flex-shrink-0">{total}</span>
        {reprintBtn}
      </div>
    );
  };

  const filteredOrders = orders.filter(order => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const orderLabel = order.table_number ? `${t('table_label')} ${order.table_number}` : order.order_source === 'takeaway' ? `${t('takeaway_short')} ${order.order_number || ''}` : order.order_source === 'delivery' ? `${t('delivery_short')} ${order.order_number || ''}` : `#${order.order_number || order.id.slice(0, 8)}`;
    const itemNames = (order.order_items || []).map(i => i.product_name || i.products?.name_az || '').join(' ').toLowerCase();
    const customerName = (order.customer_name || '').toLowerCase();
    return orderLabel.includes(q) || itemNames.includes(q) || customerName.includes(q);
  });

  const guardAction = (fn: () => void, action: string) => {
    const posRoleNorm = posRole?.toLowerCase() || '';
    if (requiresPin(posRoleNorm)) {
      setPendingAction({ fn, action });
      setPinGuardOpen(true);
      return;
    }
    fn();
  };

  const doReprint = async (order: PaidOrder) => {
    setReprinting(order.id);
    try {
      const settings = await getReceiptSettings();
      const items = (order.order_items || []).map((item: any) => ({
        name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
        quantity: item.quantity || 1,
        price: Number(item.total_price || item.unit_price || 0),
      }));
      await printReceipt({
        restaurantName: settings.restaurantName,
        address: settings.address,
        receiptTitle: settings.receiptTitle,
        currency: settings.receiptCurrency,
        serviceFeePct: settings.serviceFeePct,
        showServiceFee: settings.showServiceFee,
        footerText: settings.footerText,
        tableNumber: order.table_number ?? undefined,
        orderId: order.id,
        items,
        subtotal: Number(order.subtotal || order.total_amount) || 0,
        discount: Number(order.discount_amount) || 0,
        tip: Number(order.tip_amount) || 0,
        total: Number(order.paid_amount || order.total_amount) || 0,
        paymentMethod: order.payment_method || 'cash',
        cashAmount: Number(order.cash_amount) || (order.payment_method === 'cash' ? Number(order.paid_amount || order.total_amount) || 0 : 0),
        cardAmount: Number(order.card_amount) || (order.payment_method === 'card' ? Number(order.paid_amount || order.total_amount) || 0 : 0),
        date: order.created_at,
        time: order.created_at,
        paperWidth: settings.paperWidth,
        copies: settings.copies,
      });
      try {
        await apiFetch('/api/orders/reprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: order.id }),
        });
      } catch { /* silent */ }
    } catch { /* silent */ }
    setTimeout(() => setReprinting(null), 1500);
  };

  const openRefundModal = (order: PaidOrder) => {
    setRefundOrder(order);
    setRefundModalOpen(true);
  };

  const handleRefundSuccess = () => {
    setRefundModalOpen(false);
    setRefundOrder(null);
    fetchOrders();
    if (selectedOrder) fetchOrderDetail(selectedOrder);
  };

  const doSplit = async (order: PaidOrder) => {
    const items_to_split = (order.order_items || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price || 0,
      total_price: item.total_price || 0,
      modifiers: item.modifiers || [],
      special_notes: item.special_notes || null,
      combo_group_id: item.combo_group_id || null,
      variant_id: item.variant_id || null,
    }));
    try {
      const res = await apiFetch('/api/orders/bill-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_order_id: order.id, items_to_split }),
      });
      if (res.ok) {
        toast.success(t('order_split'));
        fetchOrders();
      } else {
        const err = await res.json();
        toast.error(err.error || t('split_failed'));
      }
    } catch { toast.error(t('error_occurred')); }
  };

  const getKitchenStatusColor = (status: string | null) => {
    // 2026-09-28 (owner: light mode — yalnız mavi/qara): amber/orange → qara
    switch (status) {
      case 'ready': case 'served': case 'completed': return 'text-emerald-500 bg-emerald-500/10';
      case 'preparing': case 'accepted': return lightMode ? 'text-zinc-900 bg-zinc-900/10' : 'text-amber-500 bg-amber-500/10';
      case 'voided': case 'cancelled': return 'text-red-500 bg-red-500/10 line-through';
      case 'wasted': return lightMode ? 'text-zinc-900 bg-zinc-900/10' : 'text-orange-500 bg-orange-500/10';
      default: return 'text-zinc-400 bg-zinc-400/10';
    }
  };

  const getKitchenStatusLabel = (status: string | null) => {
    switch (status) {
      case 'pending': return 'Gözləyir';
      case 'accepted': return 'Qəbul edildi';
      case 'preparing': return 'Hazırlanır';
      case 'ready': return 'Hazırdır';
      case 'served': return 'Verildi';
      case 'completed': return 'Tamamlandı';
      case 'voided': return 'Ləğv edildi';
      case 'cancelled': return 'Ləğv edildi';
      case 'wasted': return 'İtki';
      default: return status || '—';
    }
  };

  const filters = [
    { id: 'all', labelKey: 'all_products' },
    { id: 'dine_in', labelKey: 'dine_in' },
    { id: 'takeaway', labelKey: 'takeaway' },
    { id: 'delivery', labelKey: 'delivery' },
  ];

  const detail = detailData;
  const detailOrder = detail?.order || selectedOrder;
  const payments = detail?.payments || [];
  const auditLogs = detail?.auditLogs || [];

  // 2026-09-27 (iOS-27-trash doctrine): the `open` condition lives INSIDE
  // AnimatePresence (keyed child) instead of an early `return null` — the
  // component stays mounted so the graceful 280ms exit can actually play.
  return (
    <AnimatePresence>
      {open && (
      <motion.div
        key="order-history"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={fastExit}
        className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
        style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : undefined }}
        onClick={onClose}
      >
        <motion.div
          {...centerModal}
          // 2026-09-27 (owner: "bütün modalları üfüqi düzbucaqlı, balanslı"):
          // max-w-xl → max-w-2xl — a balanced, horizontal sheet (with the
          // VKB-fit height logic below), not a narrow tall rectangle.
          className={`relative w-full max-w-2xl rounded-[32px] shadow-overlay border ${
            lightMode ? 'bg-white/95 border-zinc-200' : 'bg-zinc-900/95 border-white/10'
          } overflow-hidden flex flex-col`}
          // 2026-09-27 (E2E collapse catch): LIST mode needs a DEFINITE height —
          // the tab panes are absolutely stacked (parallel crossfade), so a
          // max-h-only (content-sized) card collapses to header height the
          // moment a short pane enters. List = 85vh (Kassa-consistent sheet);
          // detail stays content-sized (max-h) as before.
          style={
            keyboardHeight > 0
              ? { height: `calc(100vh - ${keyboardHeight + 32}px)`, maxHeight: `calc(100vh - ${keyboardHeight + 32}px)` }
              : selectedOrder
                ? { maxHeight: '85vh' }
                : { height: '85vh', maxHeight: '85vh' }
          }
          onClick={e => e.stopPropagation()}
        >
          {/* Header — 2026-09-27 premium pass (owner: "modal düzbucaqlı forma...
              ölçülərini, künclərini, yerləşimini, animasiyasını və ümumi vizual
              iyerarxiyasını təkmilləşdir"): icon chip + title + live subtitle,
              circular ghost close. */}
          <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${lightMode ? 'border-zinc-100' : 'border-white/10'}`}>
            <div className="flex items-center gap-3 min-w-0">
              {selectedOrder ? (
                <button
                  onClick={handleBackToList}
                  className={`flex-shrink-0 w-9 h-9 rounded-2xl border flex items-center justify-center transition-all active:scale-95 ${lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}
                  title={t('back')}
                >
                  <ChevronLeft size={16} />
                </button>
              ) : (
                <div className={`flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center ${lightMode ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  <Clock size={16} />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-black tracking-tight leading-tight truncate">
                  {selectedOrder
                    ? (selectedOrder.table_number ? `${t('table_label')} ${selectedOrder.table_number}` : selectedOrder.order_source === 'takeaway' ? `${t('takeaway')}` : selectedOrder.order_source === 'delivery' ? `${t('delivery')}` : t('order_history'))
                    : t('order_history')
                  }
                </h2>
                <p className={`text-[11px] font-bold truncate ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                  {selectedOrder
                    ? `${new Date(selectedOrder.created_at).toLocaleDateString('az')} · ${new Date(selectedOrder.created_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}`
                    /* 2026-09-27 (entry-bug): never paint "0 sifariş" while the
                       first load is still in flight — that "0 → N" count flash
                       read as a bug. (After the mount prefetch this is rare;
                       the true empty state still says "0 sifariş".) */
                    : loading && totalCount === 0 && orders.length === 0
                      ? (t('loading') || 'Yüklenir...')
                      : `${totalCount} ${t('orders') || 'sifariş'}`
                  }
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-95 ${lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'}`}
              title={t('close')}
            >
              <X size={16} />
            </button>
          </div>

          {/* 2026-09-27 BUG A FIX (TARİXÇƏ): list ↔ detail is now a real STATE
              TRANSITION. Both views are separate keyed motion children inside
              ONE AnimatePresence with `mode="popLayout"` — the outgoing view
              leaves the layout flow so the incoming one owns the space
              immediately and the two fade at once (220ms fade + 8px drift, no
              empty gap, no reflow). A fragment is not tracked by
              AnimatePresence, so each view must be its own motion.div. The
              card's `backdrop-blur-xl` was removed too: a backdrop-filter on an
              ancestor freezes a far child's opacity animation in Chrome (that
              is why the switch read as an instant snap). */}
          <AnimatePresence mode="popLayout" initial={false}>
          {/* ═══════ LIST VIEW ═══════ */}
          {!selectedOrder ? (
            <motion.div
              key="oh-list"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="w-full min-h-0 flex-1 flex flex-col"
            >
              {/* 2026-09-23 (owner, Toast "Sales Exception Report"): Sifarişlər / İstisnalar.
                  2026-09-27 premium pass: true segmented control — one quiet
                  surface, the active segment is the solid pill (no more two
                  floating buttons, one always screaming emerald).
                  2026-09-27 (owner: "tablar qarışmış görünür, aydın aktiv
                  indikator"): the pill now SLIDES between segments (layoutId,
                  240ms time-based ease, zero overshoot) — the active tab is
                  unambiguous at a glance. */}
              <div className={`mx-5 mt-3 mb-0 rounded-2xl p-1 flex flex-shrink-0 ${lightMode ? 'bg-zinc-100' : 'bg-white/[0.06]'}`}>
                {([['orders', t('orders') || 'Sifarişlər'], ['exceptions', t('exceptions') || 'İstisnalar']] as const).map(([id, label]) => (
                   <button
                     key={id}
                     onClick={() => setSheetTab(id)}
                     className={`relative flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
                       sheetTab === id
                         // 2026-09-28 (owner: "Tarixçə modalında ən yuxarıdakı
                         // active pill light mode-da qara görünməlidir"):
                         // light active = BLACK pill / white text (matches the
                         // two filter groups below); dark keeps the white pill.
                         ? (lightMode ? 'text-white' : 'text-zinc-950')
                         : (lightMode ? 'text-zinc-400 hover:text-zinc-600' : 'text-white/40 hover:text-white/70')
                     }`}
                   >
                     {sheetTab === id && (
                       <motion.span
                         layoutId="oh-sheet-pill"
                         className={`absolute inset-0 rounded-xl ${lightMode ? 'bg-zinc-900' : 'bg-white'}`}
                         transition={{ duration: 0.24, ease: [0.45, 0, 0.55, 1] }}
                       />
                     )}
                    <span className="relative z-10">{label}{id === 'exceptions' && exceptions.length > 0 ? ` (${exceptions.length})` : ''}</span>
                  </button>
                ))}
              </div>

              {/* 2026-09-27 (owner: "tablar arasında hamar transition"): the tab
                  CONTENT is a real state transition — both panes stack as
                  absolute layers in this relative container (definite height,
                  see the card above) and crossfade in PARALLEL (220ms): no
                  blank frame, no reflow, each pane keeps its own scroll. The
                  search field now lives in the orders pane (it used to show
                  on exceptions where it did nothing). */}
              <div className="relative flex-1 min-h-0">
                <AnimatePresence initial={false}>
                 {sheetTab === 'orders' ? (
                 // 2026-09-28 (owner: "müştəri siyahısı başqa taba keçəndə
                 // qəfil dəyişməməlidir — Apple üslubunda hamar"): a plain
                 // opacity crossfade still read as a SNAP between two
                 // different lists; a directional 16px slide + fade
                 // (iOS tab-content feel) makes the change legible.
                 <motion.div
                   key="oh-tab-orders"
                   initial={{ opacity: 0, x: 16 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -16 }}
                   transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                   className="absolute inset-0 flex flex-col"
                 >

                  {/* 2026-09-27 (owner: "hər tab digəri ilə qarışmış görünür"):
                      the 8 loose chips from TWO different filter systems no
                      longer share one clipped scroll row. Two DISTINCT quiet
                      segmented groups, each with its own sliding pill
                      (layoutId) = a clear active indicator per group. The
                      duplicated "Hamısı" (status=all) is labeled "Bütün" so
                      the two all-filters can't be confused. */}
                  {/* 2026-09-27 (owner: "inputların bir-birinin içinə girməsi"):
                      the rows got real breathing room — the filter tracks no
                      longer touch the segmented control or the search field. */}
                  <div className="px-5 pt-3 space-y-2">
                    <div className={`rounded-xl p-0.5 flex ${lightMode ? 'bg-zinc-100' : 'bg-white/[0.06]'}`}>
                      {filters.map(f => (
                        <button
                          key={f.id}
                          onClick={() => setFilter(f.id as any)}
                          className={`relative flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                            filter === f.id
                              ? (lightMode ? 'text-white' : 'text-zinc-950')
                              : (lightMode ? 'text-zinc-400 hover:text-zinc-600' : 'text-white/40 hover:text-white/60')
                          }`}
                        >
                          {/* 2026-09-28 (owner: "light mode-da active pill-lər qara
                              rəngdə olsun və aydın görünsün"): light active pill =
                              BLACK (white text on black); dark stays white pill. */}
                          {filter === f.id && (
                            <motion.span
                              layoutId="oh-src-pill"
                              className={`absolute inset-0 rounded-[10px] ${lightMode ? 'bg-zinc-900' : 'bg-white'}`}
                              transition={{ duration: 0.24, ease: [0.45, 0, 0.55, 1] }}
                            />
                          )}
                          <span className="relative z-10">{t(f.labelKey as any)}</span>
                        </button>
                      ))}
                    </div>
                    <div className={`rounded-xl p-0.5 flex ${lightMode ? 'bg-zinc-100' : 'bg-white/[0.06]'}`}>
                      {([
                         ['paid', t('status_paid') || 'Ödənilmiş', 'text-emerald-600'],
                         ['refunded', t('status_refunded') || 'Qaytarılmış', 'text-amber-600'],
                         ['cancelled', t('status_cancelled') || 'Ləğv', 'text-red-600'],
                         ['all', 'Bütün', 'text-zinc-950'],
                       ] as const).map(([id, label, activeCls]) => (
                         <button
                           key={id}
                           onClick={() => { setStatusFilter(id); setSheetTab('orders'); }}
                           className={`relative flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                             statusFilter === id
                               ? (lightMode ? 'text-white' : activeCls)
                               : (lightMode ? 'text-zinc-400 hover:text-zinc-600' : 'text-white/40 hover:text-white/60')
                           }`}
                         >
                           {statusFilter === id && (
                             <motion.span
                               layoutId="oh-st-pill"
                               className={`absolute inset-0 rounded-[10px] ${lightMode ? 'bg-zinc-900' : 'bg-white'}`}
                               transition={{ duration: 0.24, ease: [0.45, 0, 0.55, 1] }}
                             />
                           )}
                          <span className="relative z-10">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                {/* Search + collapsed date range (2026-09-27 premium pass:
                    the always-visible date row removed one header level) */}
                <div className="px-5 pt-1 pb-3 space-y-2">
                 <div className="flex gap-2">
                   <div className="relative flex-1">
                     <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
                     <input
                       value={searchQuery}
                       onChange={e => setSearchQuery(e.target.value)}
                       placeholder={t('search_orders')}
                       className={`w-full rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold outline-none border transition-all ${
                         lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-zinc-400/50'
                       }`}
                     />
                     {searchQuery && (
                       <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                         <X size={14} />
                       </button>
                     )}
                   </div>
                   <button
                     onClick={() => setDateOpen(o => !o)}
                     title="Tarix aralığı"
                     className={`flex-shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                       dateOpen || dateFrom || dateTo
                         ? 'bg-emerald-500 border-emerald-500 text-white'
                         : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-zinc-400'
                     }`}
                   >
                     <CalendarDays size={15} />
                   </button>
                 </div>
                 <AnimatePresence initial={false}>
                   {dateOpen && (
                     <motion.div
                       initial={{ opacity: 0, height: 0 }}
                       animate={{ opacity: 1, height: 'auto' }}
                       exit={{ opacity: 0, height: 0 }}
                       transition={{ duration: T.standard, ease: EASE.morph }}
                       className="overflow-hidden"
                     >
                       <div className="flex gap-2 items-center">
                         <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                           className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold outline-none border transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-700' : 'bg-white/5 border-white/10 text-zinc-300'}`} />
                         <span className={`text-xs font-bold ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>→</span>
                         <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                           className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold outline-none border transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-700' : 'bg-white/5 border-white/10 text-zinc-300'}`} />
                         {(dateFrom || dateTo) && (
                           <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs font-bold text-emerald-500 hover:text-emerald-600 transition-colors">
                             {t('clear')}
                           </button>
                         )}
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>

                  {/* Order list — row markup in renderOrderCard() (owner
                      picked variant 1 "Clean list" 2026-09-27). */}
                  <div className="flex-1 overflow-y-auto px-5 py-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className={`w-6 h-6 border-2 rounded-full animate-spin ${lightMode ? 'border-zinc-200 border-t-zinc-900' : 'border-white/20 border-t-white/60'}`} />
                    </div>
                  ) : filteredOrders.length === 0 ? (
                  <p className="text-center text-xs opacity-40 py-12">
                    {searchQuery || dateFrom || dateTo ? t('no_search_results') : t('no_paid_orders')}
                  </p>
                 ) : (
                    filteredOrders.map(renderOrderCard)
                  )}
                 {/* 2026-09-23 (owner): "load more" — the list was hard-capped
                     at 100 orders; busy days lost their older orders. */}
                 {!loading && filteredOrders.length > 0 && loadedCount < totalCount && (
                   <button
                     onClick={loadMore}
                     disabled={loadingMore}
                     className={`w-full py-3 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/50'}`}
                   >
                      {loadingMore
                        ? <div className={`w-4 h-4 mx-auto border-2 rounded-full animate-spin ${lightMode ? 'border-zinc-200 border-t-zinc-900' : 'border-white/20 border-t-white/60'}`} />
                         : (t('load_more') || 'Daha çox yüklə')}
                    </button>
                  )}
                 </div>
                </motion.div>
                ) : (
                /* 2026-09-23 (owner, Toast "Sales Exception Report"): who voided /
                    cancelled / refunded, with reason + staff + order reference. */
                 <motion.div
                   key="oh-tab-exceptions"
                   initial={{ opacity: 0, x: 16 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -16 }}
                   transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                   className="absolute inset-0 flex flex-col"
                 >
               <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                  {exceptionsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className={`w-6 h-6 border-2 rounded-full animate-spin ${lightMode ? 'border-zinc-200 border-t-zinc-900' : 'border-white/20 border-t-white/60'}`} />
                    </div>
                  ) : exceptions.length === 0 ? (
                   <p className="text-center text-xs opacity-40 py-12">{t('no_exceptions') || 'İstisna yoxdur'}</p>
                 ) : (
                   exceptions.map(x => (
                     <div key={x.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                        <span className={`flex-shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                          x.action === 'void' ? 'bg-red-500/10 text-red-400' : x.action === 'refund' ? (lightMode ? 'bg-zinc-900/10 text-zinc-900' : 'bg-amber-500/10 text-amber-400') : 'bg-zinc-500/10 text-zinc-400'
                        }`}>
                         {x.action}
                       </span>
                       <div className="flex-1 min-w-0">
                         <p className="text-xs font-black truncate">
                           {x.order_ref || '—'}
                           {x.reason ? <span className="font-bold opacity-60"> · {x.reason}</span> : null}
                         </p>
                         <p className="text-[11px] opacity-40">
                           {new Date(x.created_at).toLocaleDateString('az')} {new Date(x.created_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}
                           {x.staff_name ? ` · ${x.staff_name}` : ''}
                         </p>
                       </div>
                     </div>
                    ))
                  )}
                  </div>
                 </motion.div>
                )}
                </AnimatePresence>
              </div>
             </motion.div>
           ) : (
              <motion.div
                key="oh-detail"
               initial={{ opacity: 0, y: 8 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -8 }}
               transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
               className="w-full flex-1 min-h-0 flex flex-col"
             >
               {detailLoading ? (
                 <div className="flex items-center justify-center py-16">
                   <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                 </div>
               ) : detailOrder ? (
                 <>
                 {/* 2026-09-27 (owner: "Refund düyməsini tapmaq üçün həddən
                     artıq aşağı sürüşdürmə") — the actions are a STICKY FOOTER:
                     they live OUTSIDE the scroller and stay visible no matter
                     how long the order's audit log is. Space trimmed 4→3. */}
                 <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                  {/* Order info badges */}
                  <div className="flex flex-wrap gap-2">
                     <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-lg ${
                       detailOrder.order_source === 'takeaway' ? (lightMode ? 'bg-zinc-900/10 text-zinc-900' : 'bg-amber-500/10 text-amber-500') :
                       detailOrder.order_source === 'delivery' ? 'bg-blue-500/10 text-blue-500' :
                       'bg-emerald-500/10 text-emerald-500'
                     }`}>
                      {detailOrder.order_source === 'takeaway' ? t('takeaway') : detailOrder.order_source === 'delivery' ? t('delivery') : t('dine_in')}
                    </span>
                    {detailOrder.table_number && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${lightMode ? 'bg-zinc-100 text-zinc-600' : 'bg-white/5 text-white/50'}`}>
                        {t('table_label')} {detailOrder.table_number}
                      </span>
                    )}
                    {detailOrder.guest_count && detailOrder.guest_count > 0 && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 ${lightMode ? 'bg-zinc-100 text-zinc-600' : 'bg-white/5 text-white/50'}`}>
                        <Users size={11} /> {detailOrder.guest_count}
                      </span>
                    )}
                    {detailOrder.assigned_to_name && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 ${lightMode ? 'bg-zinc-100 text-zinc-600' : 'bg-white/5 text-white/50'}`}>
                        <User size={11} /> {detailOrder.assigned_to_name}
                      </span>
                    )}
                  </div>

                   {/* AUDIT 2026-09-23: customer + delivery identity — was in
                       the DB on every order but invisible in the detail view. */}
                   {(detailOrder.customer_name || detailOrder.customer_phone || (detailOrder as any).delivery_address) && (
                     <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                       <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('customer') || 'Müşəri'}</p>
                       <div className="space-y-1">
                         {detailOrder.customer_name && (
                           <p className="flex items-center gap-2 text-xs font-bold"><User size={11} className={lightMode ? 'text-zinc-400' : 'text-white/30'} />{detailOrder.customer_name}</p>
                         )}
                         {detailOrder.customer_phone && (
                           <p className="flex items-center gap-2 text-xs font-bold tabular-nums"><Clock size={11} className={lightMode ? 'text-zinc-400' : 'text-white/30'} />{detailOrder.customer_phone}</p>
                         )}
                         {(detailOrder as any).delivery_address && (
                           <p className="flex items-center gap-2 text-xs font-bold"><Package size={11} className={lightMode ? 'text-zinc-400' : 'text-white/30'} />{[ (detailOrder as any).delivery_street, (detailOrder as any).delivery_building, (detailOrder as any).delivery_address ].filter(Boolean).join(', ')}{(detailOrder as any).delivery_zone ? ` · ${(detailOrder as any).delivery_zone}` : ''}</p>
                         )}
                       </div>
                     </div>
                   )}

                   {/* Items */}
                   <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                     <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                       {t('items')} ({(detailOrder.order_items || []).length})
                     </p>
                    <div className="space-y-2">
                      {(detailOrder.order_items || []).map((item) => {
                        const mods = (() => {
                          if (!item.modifiers) return [];
                          if (Array.isArray(item.modifiers)) return item.modifiers;
                          try { return JSON.parse(item.modifiers); } catch { return []; }
                        })();
                        return (
                          <div key={item.id} className={`flex items-start justify-between py-2 border-b last:border-b-0 ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>
                                  {item.quantity}x {item.product_name}
                                </span>
                                {item.variant_name && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/5 text-white/30'}`}>
                                    {item.variant_name}
                                  </span>
                                )}
                              </div>
                              {mods.length > 0 && (
                                <p className={`text-[10px] mt-0.5 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                  + {mods.map((m: any) => m.name || m).join(', ')}
                                </p>
                              )}
                              {item.special_notes && (
                                <p className={`text-[10px] mt-0.5 italic ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                  {item.special_notes}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 ml-2">
                              <span className={`text-xs font-black tabular-nums ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
                                ₼{(Number(item.total_price || item.unit_price * item.quantity) || 0).toFixed(2)}
                              </span>
                              {item.kitchen_status && (
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${getKitchenStatusColor(item.kitchen_status)}`}>
                                  {getKitchenStatusLabel(item.kitchen_status)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Financial breakdown */}
                  <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                      {t('total_label') || 'Maliyyət'}
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className={`text-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('subtotal_label') || 'Ara cəm'}</span>
                        <span className="text-xs font-bold tabular-nums">₼{(Number(detailOrder.subtotal || detailOrder.total_amount) || 0).toFixed(2)}</span>
                      </div>
                       {(Number(detailOrder.discount_amount) || 0) > 0 && (
                         <div className="flex justify-between">
                           <span className="text-xs text-emerald-500">
                             {t('discount_label')}
                             {(detailOrder as any).campaigns?.name ? <span className="opacity-60"> · {(detailOrder as any).campaigns.name}</span> : ''}
                           </span>
                           <span className="text-xs font-bold tabular-nums text-emerald-500">−₼{Number(detailOrder.discount_amount).toFixed(2)}</span>
                         </div>
                       )}
                       {/* AUDIT 2026-09-23: delivery fee + service charge + VAT
                           were in the DB on every order but hidden here — the
                           cashier couldn't reconcile the printed total. */}
                       {(Number((detailOrder as any).delivery_fee) || 0) > 0 && (
                         <div className="flex justify-between">
                           <span className={`text-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('delivery_fee') || 'Çatdırılma'}</span>
                           <span className="text-xs font-bold tabular-nums">₼{Number((detailOrder as any).delivery_fee).toFixed(2)}</span>
                         </div>
                       )}
                       {(Number((detailOrder as any).service_charge_amount) || 0) > 0 && (
                         <div className="flex justify-between">
                           <span className={`text-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{(t as any)('service_charge') || 'Servis'}</span>
                           <span className="text-xs font-bold tabular-nums">₼{Number((detailOrder as any).service_charge_amount).toFixed(2)}</span>
                         </div>
                       )}
                       <div className={`flex justify-between pt-1.5 border-t ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
                        <span className="text-xs font-black">{t('total_label') || 'Cəm'}</span>
                        <span className="text-sm font-black tabular-nums">₼{(Number(detailOrder.total_amount) || 0).toFixed(2)}</span>
                      </div>
                      {(Number(detailOrder.refund_amount) || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-xs text-red-500">{t('refunded') || 'Geri qaytarıldı'}</span>
                          <span className="text-xs font-bold tabular-nums text-red-500">−₼{Number(detailOrder.refund_amount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className={`flex justify-between pt-1.5 border-t font-black ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
                        <span className="text-xs">{t('paid_amount') || 'Ödənilən'}</span>
                        <span className="text-sm tabular-nums text-emerald-500">₼{(Number(detailOrder.paid_amount) || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment breakdown */}
                  {(payments.length > 0 || detailOrder.payment_method) && (
                    <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                        {t('payment') || 'Ödəniş'}
                      </p>
                      {payments.length > 0 ? (
                        <div className="space-y-2">
                          {payments.filter(p => !p.is_refund).map(p => (
                            <div key={p.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {(p.method || p.payment_method) === 'cash' ? (
                                  <Wallet size={12} className="text-emerald-500" />
                                ) : (p.method || p.payment_method) === 'card' ? (
                                  <CreditCard size={12} className="text-blue-500" />
                                ) : (
                                  <Receipt size={12} className="text-zinc-400" />
                                )}
                                <span className={`text-xs font-bold capitalize ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
                                  {p.method || p.payment_method || '—'}
                                </span>
                                {p.is_partial && (
                                   <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${lightMode ? 'text-zinc-900 bg-zinc-900/10' : 'text-amber-500 bg-amber-500/10'}`}>PARTIAL</span>
                                )}
                              </div>
                              <span className="text-xs font-black tabular-nums">₼{Number(p.amount).toFixed(2)}</span>
                            </div>
                          ))}
                          {payments.filter(p => p.is_refund).map(p => (
                            <div key={p.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <RefreshCw size={12} className="text-red-500" />
                                <span className="text-xs font-bold text-red-500">{t('refund') || 'Geri ödəniş'}</span>
                              </div>
                              <span className="text-xs font-black tabular-nums text-red-500">−₼{Number(p.amount).toFixed(2)}</span>
                            </div>
                          ))}
                          {(Number(detailOrder.tip_amount) || 0) > 0 && (
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>{t('tip') || 'Propina'}</span>
                              <span className="text-xs font-black tabular-nums">₼{Number(detailOrder.tip_amount).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('payment_method') || 'Ödəniş üsulu'}</span>
                          <span className="text-xs font-black capitalize">{detailOrder.payment_method || '—'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timeline / Audit */}
                  {auditLogs.length > 0 && (
                    <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                        {t('timeline') || 'Tarixçə'}
                      </p>
                      {/* 2026-09-27 (owner: "lazımsız uzun məzmunu və scroll-u
                          azalt"): the audit log is COLLAPSED to the 3 newest
                          entries by default — a busy order had 100 rows pushing
                          the action buttons off-screen. "Bütün tarixçə (N)"
                          expands the full log (AUDIT 2026-09-23 §4.6 kept). */}
                      <div className="space-y-2">
                        {auditLogs.slice(0, auditExpanded ? 100 : 3).map((log) => (
                          <div key={log.id} className="flex items-start gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${lightMode ? 'bg-zinc-300' : 'bg-white/20'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${lightMode ? 'text-zinc-700' : 'text-white/70'}`}>
                                  {log.action}
                                </span>
                                {log.staff_name && (
                                  <span className={`text-[9px] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                    — {log.staff_name}
                                  </span>
                                )}
                              </div>
                              {log.reason && (
                                <p className={`text-[10px] ${lightMode ? 'text-zinc-400' : 'text-white/25'}`}>{log.reason}</p>
                              )}
                              <p className={`text-[9px] ${lightMode ? 'text-zinc-300' : 'text-white/15'}`}>
                                {new Date(log.created_at).toLocaleString('az', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {auditLogs.length > 3 && (
                        <button
                          onClick={() => setAuditExpanded(v => !v)}
                          className={`mt-2.5 w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${lightMode ? 'text-zinc-500 hover:bg-zinc-100' : 'text-white/40 hover:bg-white/5'}`}
                        >
                          {auditExpanded ? 'Yığcam göstər' : `Bütün tarixçə (${auditLogs.length})`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Customer note */}
                  {detailOrder.customer_note && (
                    <div className={`p-3 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                        {t('note') || 'Qeyd'}
                      </p>
                      <p className={`text-xs ${lightMode ? 'text-zinc-600' : 'text-white/50'}`}>{detailOrder.customer_note}</p>
                    </div>
                  )}

                 </div>

                 {/* Detail actions — STICKY FOOTER (always visible, outside
                     the scroller): reprint + the refund button the owner said
                     should never require scrolling to find. */}
                 <div className={`flex-shrink-0 px-5 py-3 border-t ${lightMode ? 'border-zinc-100' : 'border-white/10'}`}>
                   <div className="flex gap-2">
                    <button
                      onClick={() => guardAction(() => doReprint(detailOrder), 'reprint')}
                      disabled={reprinting === detailOrder.id}
                      className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border flex items-center justify-center gap-2 transition-all ${lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
                    >
                      <Printer size={14} /> {t('reprint') || 'Çap'}
                    </button>
                    {/* 2026-09-26 (owner): previously only status==='paid' — a
                        partially_refunded order (e.g. ₼30 of ₼100 refunded)
                        locked the button even though the API explicitly
                        supports sequential partial refunds. The
                        remaining-amount check is the real gate. */}
                    <button
                      onClick={() => guardAction(() => openRefundModal(detailOrder), 'refund')}
                      // 2026-09-29 (round-6 E2E): paid_amount is NET (decremented
                      // by each refund) — refund is unavailable only when the
                      // net hits 0 (the old refund_amount >= paid_amount test
                      // disabled the button after the first partial refund).
                      disabled={!['paid', 'partially_refunded'].includes(detailOrder.status) || (Number(detailOrder.paid_amount) || 0) <= 0.01}
                       className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${lightMode ? 'bg-zinc-900/10 border-zinc-900/20 text-zinc-900 hover:bg-zinc-900/15' : 'bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20'}`}
                    >
                      <RefreshCw size={14} /> {t('refund') || 'Geri ödəniş'}
                    </button>
                   </div>
                 </div>
                 </>
                ) : (
                  <div className="py-16 text-center">
                    <p className="text-xs opacity-40">Sifariş tapılmadı</p>
                  </div>
                )}
             </motion.div>
          )}
          </AnimatePresence>

           {/* ═══════ INTEGRATED REFUND MODAL ═══════ */}
          <AnimatePresence>
            {refundModalOpen && refundOrder && (
              <RefundView
                order={refundOrder}
                payments={payments}
                onSuccess={handleRefundSuccess}
                onClose={() => { setRefundModalOpen(false); setRefundOrder(null); }}
              />
            )}
          </AnimatePresence>

          <PinGuard
            open={pinGuardOpen}
            onClose={() => { setPinGuardOpen(false); setPendingAction(null); }}
            onVerified={() => { if (pendingAction) { pendingAction.fn(); setPendingAction(null); } }}
            action={pendingAction?.action || 'reprint'}
          />
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════
   RefundView — Full / Partial / Item-level refund
   Uses /api/orders/refund (Mode 1: refund_with_inventory, Mode 2: complete_payment_atomic_v2)
   ═══════════════════════════════════════════ */
function RefundView({
  order,
  payments,
  onSuccess,
  onClose,
}: {
  order: PaidOrder;
  payments: PaymentRecord[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();

  const [mode, setMode] = useState<'full' | 'partial' | 'item'>('full');
  // 2026-09-30 (owner, round 8: "refund modalına basanda loading zamani bir
  // bug var"): the amount used to start as '' and be filled by a useEffect
  // AFTER the first paint — so on open the input flashed EMPTY for a frame
  // and the number POPPED in (plus DAVAM ET toggled disabled→enabled). Mode
  // always opens as 'full', so initialize with the full remaining amount —
  // the effect below only keeps it in sync on LATER mode/remaining changes.
  const [amount, setAmount] = useState(() => Math.max(0, Number(order.paid_amount || order.total_amount) || 0).toFixed(2));
  const [reason, setReason] = useState('');
  // 2026-09-28 (owner: "Refund modalı üçün state machine yoxdur — bütün
  // vəziyyətləri və keçidlərini düzgün state machine ilə qur"): the refund
  // flow is now an explicit FSM instead of one always-visible form + a
  // `loading` flag:
  //
  //   open → EDIT ──valid──► CONFIRM ──submit──► PROCESSING ──ok──► SUCCESS
  //                ▲             │                    └─fail─► ERROR
  //                └──(Geri)─────┘                    SUCCESS ─(Bağla)→ closed
  //                                                  ERROR ─(Yenidən cəhd)→ PROCESSING
  //                                                  ERROR ─(Bağla)→ closed
  //
  // Guards:
  //  · EDIT→CONFIRM: 0 < amount ≤ qalan (full/partial) OR ≥1 item selected
  //  · PROCESSING: close/backdrop blocked (a half-sent refund must not be
  //    abandoned mid-flight); inputs locked
  //  · ERROR retry: reuses the SAME idempotency key (P-4) → the DB boundary
  //    replays the stored result (one refund row, no double money movement)
  type RefundStage = 'edit' | 'confirm' | 'processing' | 'success' | 'error';
  const [stage, setStage] = useState<RefundStage>('edit');
  const [errorMsg, setErrorMsg] = useState('');
  const [doneAmount, setDoneAmount] = useState(0);
  // round 8 ("refund detalları"): what the order looks like AFTER the refund —
  // the success screen shows it instead of a bare amount.
  const [doneRemaining, setDoneRemaining] = useState(0);
  // 2026-09-26 (owner): refund METHOD choice. Default = how the order was
  // paid, but operators can pick another (real case: kartla ödədi → nağd
  // geri verdi). The chosen method is persisted on the refund ledger row.
  const originalMethod = order.payment_method || 'cash';
  const [refundMethod, setRefundMethod] = useState<string>(originalMethod);
  const methodOptions = Array.from(new Set(['cash', 'card', originalMethod]));

  // P-4 (D-1/D-4): memoized refund retry tokens per (order, op) for this view
  // instance. A double-click / lost-response retry of the SAME refund reuses
  // the SAME key → the boundary replays the stored result (one refund row).
  // A different refund (other item/qty/amount) gets a different key →
  // independent. Reusing a key with a different amount is a 409 at the DB.
  const refundKeyRef = useRef<Map<string, string>>(new Map());
  const refundKeyFor = useCallback((op: string) => {
    let tok = refundKeyRef.current.get(op);
    if (!tok) {
      tok = `refund:${order.id}:${op}:${crypto.randomUUID()}`;
      refundKeyRef.current.set(op, tok);
    }
    return tok;
  }, [order.id]);

  const [selectedItems, setSelectedItems] = useState<Record<string, { qty: number; fate: 'return_to_stock' | 'waste' | 'none' }>>({});

  const paidAmount = Number(order.paid_amount || order.total_amount) || 0;
  const totalRefunded = Number(order.refund_amount) || 0;
  // 2026-09-29 (round-6 E2E: "Qalan" showed ₼0.00 after a 50% refund):
  // paid_amount is NET — the refund flow decrements it — so the remaining
  // refundable IS paid_amount. Subtracting totalRefunded again was the
  // client-side twin of the server guard bug (both now fixed in step).
  const remaining = Math.max(0, paidAmount);

  useEffect(() => {
    if (mode === 'full') setAmount(remaining.toFixed(2));
    else setAmount('');
  }, [mode, remaining]);

  const refundAmount = parseFloat(amount) || 0;
  const isFullRefund = mode === 'full' || Math.abs(refundAmount - remaining) < 0.01;
  const isValid = refundAmount > 0 && refundAmount <= remaining + 0.01;
  // 2026-09-29 (owner: "refund modalında problem var + hər state machine üçün
  // transition"): over-amount is now a REAL visible state (red border + pop
  // hint) instead of a silently-disabled green input.
  const isOverAmount = refundAmount > remaining + 0.01;
  // The MODE selector (Tam / Qismən / Məhsul) is the modal's main state
  // machine — its active capsule is ONE measured element that SPRINGS between
  // buttons on every state flip (state→motion, Philosophy §1/§5).
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [modeInd, setModeInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const idx = mode === 'full' ? 0 : mode === 'partial' ? 1 : 2;
    const el = modeRefs.current[idx];
    if (!el) { setModeInd(null); return; }
    setModeInd((prev) => (prev && prev.x === el.offsetLeft && prev.w === el.offsetWidth ? prev : { x: el.offsetLeft, w: el.offsetWidth }));
  }, [mode]);

  const toggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems(prev => {
      if (prev[itemId]) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { qty: maxQty, fate: 'none' } };
    });
  };

  const updateItemQty = (itemId: string, qty: number) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], qty },
    }));
  };

  const updateItemFate = (itemId: string, fate: 'return_to_stock' | 'waste' | 'none') => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], fate },
    }));
  };

  const itemTotal = Object.entries(selectedItems).reduce((sum, [id, sel]) => {
    const item = order.order_items?.find(i => i.id === id);
    if (!item) return sum;
    return sum + (Number(item.unit_price) * sel.qty);
  }, 0);

  // FSM transitions.
  const canProceed = mode === 'item'
    ? Object.keys(selectedItems).length > 0
    : isValid;
  const goConfirm = () => { if (canProceed) setStage('confirm'); };
  const goBackToEdit = () => { if (stage === 'confirm') setStage('edit'); };

  // PROCESSING: run the refund against /api/orders/refund and land on
  // SUCCESS or ERROR. Retry from ERROR re-enters here with the SAME
  // idempotency keys (P-4 replay → exactly one refund row).
  const submitRefund = async () => {
    setStage('processing');
    setErrorMsg('');
    try {
      if (mode === 'item') {
        const itemEntries = Object.entries(selectedItems);
        let allOk = true;
        let okTotal = 0;
        for (const [itemId, sel] of itemEntries) {
          const item = order.order_items?.find(i => i.id === itemId);
          if (!item) continue;
          const itemAmount = Number(item.unit_price) * sel.qty;
          const body = sel.fate === 'none'
            ? { order_id: order.id, amount: itemAmount, method: refundMethod, reason: reason || 'customer_return', idempotency_key: refundKeyFor(`item:${itemId}:${refundMethod}:none:${itemAmount}`) }
            : { order_id: order.id, order_item_id: itemId, quantity: sel.qty, amount: itemAmount, method: refundMethod, item_fate: sel.fate, reason: reason || 'customer_return', idempotency_key: refundKeyFor(`item:${itemId}:${refundMethod}:${sel.fate}:${sel.qty}`) };
          const res = await apiFetch('/api/orders/refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setErrorMsg(err.error || 'Refund uğursuz oldu');
            allOk = false;
            break;
          }
          okTotal += itemAmount;
        }
        if (allOk) { setDoneAmount(okTotal); setDoneRemaining(Math.max(0, remaining - okTotal)); setStage('success'); }
        else setStage('error');
      } else {
        const res = await apiFetch('/api/orders/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: order.id,
            amount: refundAmount,
            method: refundMethod,
            reason: reason || 'Refund',
            idempotency_key: refundKeyFor(`order:${mode}:${refundMethod}:${refundAmount}`),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false) {
          setDoneAmount(refundAmount);
          setDoneRemaining(Math.max(0, remaining - refundAmount));
          setStage('success');
        } else {
          setErrorMsg(data.error || 'Refund uğursuz oldu');
          setStage('error');
        }
      }
    } catch {
      setErrorMsg('Xəta baş verdi — bağlantını yoxlayın');
      setStage('error');
    }
  };

  // Close rule: blocked while PROCESSING (mid-flight refund), SUCCESS closes
  // through onSuccess (order list refreshes), everything else aborts.
  const guardedClose = () => {
    if (stage === 'processing') return;
    if (stage === 'success') { onSuccess(); return; }
    onClose();
  };

  // 2026-09-27 (owner: "refund modalı klaviatura açıldıqda ekrandan yuxarı
  // çıxmasın... bütün modalları üfüqi düzbucaqlı, balanslı"): LAYOUT REDESIGN —
  // a WIDE two-column sheet (summary + method left, mode + amount + reason
  // right, warning + actions as a full-width footer) so the whole flow fits
  // in ~450px of height instead of a 700px+ single column. The card is also
  // capped against BOTH the in-app virtual keyboard (--vk-height) and the
  // native VKB (useKeyboardHeight) so it can never ride above the visible
  // area when a keyboard opens.
  const keyboardHeight = useKeyboardHeight();

  // 2026-09-28 (owner: "refund modalının UI-sını yenidən yaz — light
  // mode-da tam görünən, oxunaqlı və səliqəli"): the card now carries an
  // EXPLICIT text color — before, children with no own color (amounts,
  // qty digits, summary values) inherited WHITE from the dark-themed
  // sheet and were invisible on the white light card.
  // 2026-09-29 (E2E): this comment used to sit INSIDE the JSX (between the
  // backdrop's open tag and its child) and rendered as VISIBLE TEXT on the
  // modal ("// 2026-09-28 (owner: refund modalının UI-sını…)") — moved here.
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={fastExit}
      className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-black/25 backdrop-blur-sm"
      style={{ paddingBottom: `calc(var(--vk-height, 0px) + ${keyboardHeight}px + 16px)` }}
      onClick={guardedClose}
    >
      <motion.div
        {...slideUp}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-elevated border ${lightMode ? 'bg-white text-zinc-900 border-zinc-200' : 'bg-zinc-900 text-white border-white/10'}`}
        style={{ maxHeight: `calc(100vh - var(--vk-height, 0px) - ${keyboardHeight}px - 48px)` }}
      >
        {/* Header — shared by every FSM stage; the step chip shows where in
            Seçim → Təsdiq → Nəticə the flow currently sits. */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <RefreshCw size={14} className={`flex-shrink-0 ${lightMode ? 'text-blue-600' : 'text-amber-500'}`} />
            <h3 className="text-sm font-black truncate">
              {t('refund') || 'Geri ödəniş'}
              {order.table_number ? ` · ${t('table_label')} ${order.table_number}` : order.order_number ? ` · ${order.order_number}` : ''}
            </h3>
            <div className="flex items-center gap-1 flex-shrink-0">
              {(['Seçim', 'Təsdiq', 'Nəticə'] as const).map((lbl, i) => {
                const stageIdx = stage === 'edit' ? 0 : stage === 'confirm' ? 1 : 2;
                const current = i === stageIdx || (stage === 'error' && i === 2);
                const passed = i < stageIdx && stage !== 'error';
                return (
                  <span key={lbl} className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    current
                      ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-amber-500/20 text-amber-400')
                      : passed
                        ? (lightMode ? 'bg-blue-100 text-blue-700' : 'bg-white/10 text-white/50')
                        : (lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/25')
                  }`}>{lbl}</span>
                );
              })}
            </div>
          </div>
          <button onClick={guardedClose} disabled={stage === 'processing'}
            className={`p-1.5 rounded-xl transition-all flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
            <X size={16} />
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
        {/* ═══ STAGE: EDIT (Seçim) ═══ */}
        {stage === 'edit' && (
        <motion.div key="stage-edit"
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        >
        <div className="sm:grid sm:grid-cols-2 sm:gap-x-6">
        {/* LEFT COLUMN: paid summary + refund method */}
        <div>
        {/* Paid info */}
        <div className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
          <div className="flex justify-between">
            <span className={`text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('paid_amount') || 'Ödənilən'}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('refunded') || 'Geri qaytarılan'}</span>
          </div>
          <div className="flex justify-between mt-1">
            {/* 2026-09-29: "Ödənilən" shows the GROSS the customer handed over
                (net + already refunded) — net alone would read lower than the
                order total after a partial refund. */}
            <span className="text-lg font-black tabular-nums">₼{(paidAmount + totalRefunded).toFixed(2)}</span>
            <span className={`text-lg font-black tabular-nums ${totalRefunded > 0 ? 'text-red-500' : ''}`}>₼{totalRefunded.toFixed(2)}</span>
          </div>
          <div className={`flex justify-between pt-1.5 mt-1.5 border-t ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
            <span className={`text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('remaining') || 'Qalan'}</span>
            <span className={`text-sm font-black tabular-nums ${lightMode ? 'text-emerald-600' : 'text-emerald-500'}`}>₼{remaining.toFixed(2)}</span>
          </div>
        </div>

        {/* REFUND METHOD (defaults to the method the order was paid with; the
            operator can pick another — persisted on the refund ledger row).
            2026-09-28 (owner: "böyük mənasız izah mətnini sil"): the long
            amber explanation boxes (kart-refund handheld note / fərqli üsul
            note) are GONE — the method buttons carry the decision. */}
        <div className="mb-4">
          <p className={`mb-2 text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>Qaytarılma üsulu</p>
          <div className="grid grid-cols-2 gap-2">
            {methodOptions.map(m => (
              <button key={m} type="button" onClick={() => setRefundMethod(m)}
                className={`h-10 rounded-xl border text-xs font-black transition-all duration-200 ${refundMethod === m ? (lightMode ? 'border-red-300 bg-red-50 text-red-600' : 'border-red-500/50 bg-red-500/10 text-red-300') : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-zinc-300' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}>
                {m === 'cash' ? 'Nağd' : m === 'card' ? 'Kart' : m}
              </button>
            ))}
          </div>
        </div>
        </div>

        {/* RIGHT COLUMN: mode + amount/items + reason */}
        <div>
        {/* 2026-09-29 (owner: state-machine transitions): the active mode is
            a MEASURED sliding capsule (springs between buttons on every flip)
            + a 200ms text-color crossfade — the mode change is now a visible
            state transition, not an instant repaint. */}
        <div className="relative flex gap-2 mb-4">
          {modeInd && (
            <motion.div
              aria-hidden
              initial={false}
              animate={{ x: modeInd.x, width: modeInd.w }}
              transition={SPRING.micro}
              // light = the modal's BLUE accent (a jet-black pill was rejected
              // for the product modal's category pill — same language here).
              className={`absolute top-0 bottom-0 rounded-2xl border ${lightMode ? 'bg-blue-500 border-blue-500' : 'bg-amber-500/10 border-amber-500/30'}`}
            />
          )}
          {[
            { key: 'full' as const, label: t('full_refund') || 'Tam', desc: remaining.toFixed(2) + ' ₼' },
            { key: 'partial' as const, label: t('partial_refund') || 'Qismən', desc: '' },
            { key: 'item' as const, label: t('item_refund') || 'Məhsul', desc: '' },
          ].map((m, i) => (
            <button
              key={m.key}
              ref={(el) => { modeRefs.current[i] = el; }}
              onClick={() => setMode(m.key)}
              className={`relative z-10 flex-1 py-2.5 rounded-2xl border text-center transition-colors duration-200 ${
                mode === m.key
                  ? (lightMode ? 'border-transparent text-white' : 'border-transparent text-amber-400')
                  : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-wider">{m.label}</p>
              {/* light: desc sits on the blue capsule → white 70% (readable);
                  inactive → inherit muted. */}
              {m.desc && <p className={`text-[9px] mt-0.5 ${lightMode ? (mode === m.key ? 'text-white/70' : 'opacity-60') : 'opacity-60'}`}>{m.desc}</p>}
            </button>
          ))}
        </div>

        {/* Amount input for full/partial */}
        {mode !== 'item' && (
          <div className="mb-4">
            <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {t('refund_amount') || 'Geri qaytarılacaq məbləğ'}
            </p>
             <div className="relative">
               <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black ${isOverAmount ? 'text-red-500' : lightMode ? 'text-zinc-400' : 'text-white/40'}`}>₼</span>
               <input
                 type="number" step="0.01" min="0" max={remaining}
                 value={amount} onChange={e => setAmount(e.target.value)}
                 placeholder="0.00"
                 className={`w-full rounded-2xl pl-9 pr-5 py-3.5 text-lg font-black outline-none border transition-all duration-200 ${
                   isOverAmount
                     ? 'bg-red-500/5 border-red-500/60 text-red-600 dark:text-red-300'
                     : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-blue-500' : 'bg-white/5 border-white/10 text-white focus:border-emerald-400/50'
                 }`}
               />
             </div>
             {/* 2026-09-29 (owner: state transitions): over-amount shows a
                 spring-pop one-line hint — the state is VISIBLE, not just a
                 disabled button. */}
             <AnimatePresence>
               {isOverAmount && mode !== 'full' && (
                 <motion.p
                   key="over-hint"
                   initial={{ opacity: 0, y: -4, height: 0 }}
                   animate={{ opacity: 1, y: 0, height: 'auto' }}
                   exit={{ opacity: 0, y: -4, height: 0 }}
                   transition={SPRING.micro}
                   className="mt-1.5 text-[10px] font-bold text-red-600 dark:text-red-400 overflow-hidden"
                 >
                   Qalan məbləgdən çox girmək olmaz (maks ₼{remaining.toFixed(2)})
                 </motion.p>
               )}
             </AnimatePresence>
             {/* 2026-09-29 (owner: state transitions): the quick-% buttons
                 now have a real ACTIVE state (200ms crossfade) — the selected
                 share is readable at a glance. */}
             {mode === 'partial' && (
               <div className="flex gap-2 mt-2">
                 {[25, 50, 75].map(pct => {
                   const val = remaining * pct / 100;
                   const on = Math.abs(refundAmount - val) < 0.01;
                   return (
                   <button key={pct} onClick={() => setAmount(val.toFixed(2))}
                     className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all duration-200 ${
                       on
                         ? (lightMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-amber-500/10 border-amber-500/40 text-amber-400')
                         : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'
                     }`}>
                     {pct}%
                   </button>
                   );
                 })}
                 {(() => {
                   const on = Math.abs(refundAmount - remaining) < 0.01;
                   return (
                   <button onClick={() => setAmount(remaining.toFixed(2))}
                     className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all duration-200 ${
                       on
                         ? (lightMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-amber-500/10 border-amber-500/40 text-amber-400')
                         : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'
                     }`}>
                     {t('full') || 'Tam'}
                   </button>
                   );
                 })()}
               </div>
             )}
           </div>
         )}

        {/* Item selection for item-level refund */}
        {mode === 'item' && (
          <div className="mb-4 space-y-2">
            <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {t('select_items') || 'Məhsulları seçin'}
            </p>
            <div className={`rounded-2xl border overflow-hidden ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
              {(order.order_items || []).map(item => {
                const isSelected = !!selectedItems[item.id];
                const sel = selectedItems[item.id];
                const isVoided = item.kitchen_status === 'voided' || item.kitchen_status === 'cancelled';
                const isWasted = item.kitchen_status === 'wasted';
                const canRefund = !isVoided && !isWasted;
                const parsedMods = (() => {
                  if (!item.modifiers) return [];
                  if (Array.isArray(item.modifiers)) return item.modifiers;
                  try { return JSON.parse(item.modifiers); } catch { return []; }
                })();
                return (
                  <div key={item.id} className={`p-3 border-b last:border-b-0 ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => canRefund && toggleItem(item.id, item.quantity)}
                        disabled={!canRefund}
                           className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                           isSelected ? (lightMode ? 'bg-zinc-900 border-zinc-900' : 'bg-amber-500 border-amber-500') : canRefund
                             ? lightMode ? 'border-zinc-300' : 'border-white/20'
                             : 'border-zinc-300 opacity-30'
                         }`}
                      >
                         {/* 2026-09-29 (owner: state transitions): the check
                             pops in/out with a micro spring. */}
                         <AnimatePresence initial={false}>
                           {isSelected && (
                             <motion.svg
                               key="it-check"
                               width="10" height="10" viewBox="0 0 10 10" fill="none"
                               initial={{ scale: 0.4, opacity: 0 }}
                               animate={{ scale: 1, opacity: 1 }}
                               exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
                               transition={SPRING.micro}
                             >
                               <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                             </motion.svg>
                           )}
                         </AnimatePresence>
                       </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold truncate ${lightMode ? 'text-black' : 'text-white'}`}>
                            {item.quantity}x {item.product_name}
                          </span>
                           {isVoided && <span className="text-[9px] text-red-500 font-bold">LƏĞV</span>}
                           {isWasted && <span className={`text-[9px] font-bold ${lightMode ? 'text-zinc-900' : 'text-orange-500'}`}>İTKİ</span>}
                        </div>
                        {parsedMods.length > 0 && (
                          <p className={`text-[9px] ${lightMode ? 'text-zinc-400' : 'text-white/25'}`}>
                            {parsedMods.map((m: any) => m.name || m).join(', ')}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-black tabular-nums ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
                        ₼{(Number(item.unit_price) * (sel?.qty || item.quantity)).toFixed(2)}
                      </span>
                    </div>

                    {/* Item fate selector (only for selected items) */}
                    {isSelected && sel && (
                      <div className="mt-2 ml-8 space-y-2">
                        {/* Quantity selector */}
                        {item.quantity > 1 && (
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Sayı:</span>
                            <button onClick={() => sel.qty > 1 && updateItemQty(item.id, sel.qty - 1)}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/10 text-white/40'}`}>
                              <Minus size={10} />
                            </button>
                            <span className="text-xs font-black tabular-nums w-6 text-center">{sel.qty}</span>
                            <button onClick={() => sel.qty < item.quantity && updateItemQty(item.id, sel.qty + 1)}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/10 text-white/40'}`}>
                              +
                            </button>
                          </div>
                        )}
                        {/* Fate buttons */}
                        <div className="flex gap-1.5">
                           {[
                              // 2026-09-29 (owner, round 7 #5: "toxunma elementinin
                              // nə üçün olduğunu yoxla"): the fate='none' option IS
                              // functional — it refunds the amount WITHOUT any
                              // inventory effect (item goes back to the customer /
                              // disposition unknown). The label "Toxunma" was
                              // meaningless; renamed to "Qeydsiz" (no record) with
                              // a tooltip explaining what it does.
                              { key: 'none' as const, icon: Package, label: 'Qeydsiz', title: 'Anbara qaytarılmır, itkiyə yazılmır — yalnız məbləğ geri qaytarılır', color: lightMode ? 'text-zinc-900 bg-zinc-100' : 'text-white/40 bg-white/5' },
                              { key: 'return_to_stock' as const, icon: PackageOpen, label: 'Anbara qaytar', title: 'Məhsul anbar stokuna qaytarılır', color: lightMode ? 'text-blue-600 bg-blue-50' : 'text-blue-400 bg-blue-500/10' },
                              { key: 'waste' as const, icon: AlertTriangle, label: 'İtkiyə yaz', title: 'Məhsul itki (waste) olaraq qeyd olunur', color: lightMode ? 'text-zinc-900 bg-zinc-100' : 'text-orange-400 bg-orange-500/10' },
                            ].map(f => (
                              <button key={f.key} onClick={() => updateItemFate(item.id, f.key)} title={f.title}
                                className={`flex-1 py-1.5 rounded-xl text-[9px] font-bold flex items-center justify-center gap-1 transition-all ${
                                  sel.fate === f.key ? f.color + ' ring-1 ring-current' : lightMode ? 'text-zinc-400 bg-zinc-50' : 'text-white/30 bg-white/5'
                                }`}>
                                <f.icon size={10} />
                                {f.label}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {mode === 'item' && Object.keys(selectedItems).length > 0 && (
              <p className={`text-xs text-right font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>
                Cəm: ₼{itemTotal.toFixed(2)}
              </p>
            )}
          </div>
        )}

        {/* Reason */}
        <div className="mb-4">
          <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
            {t('refund_reason') || 'Səbəb'}
          </p>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder={t('refund_reason_placeholder') || 'Müştəri şikayəti...'}
            className={`w-full rounded-2xl px-4 py-3 text-sm font-medium outline-none border transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-400/50'}`} />
        </div>

        </div>
        {/* EDIT footer: Ləğv et → abort · Davam et → CONFIRM (guard: canProceed) */}
        <div className="mt-4 sm:mt-5 sm:col-span-2 flex gap-3">
          <button onClick={onClose}
            className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
            {t('cancel') || 'Ləğv et'}
          </button>
          <button onClick={goConfirm} disabled={!canProceed}
            className={`flex-1 py-3.5 rounded-2xl text-white text-xs font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg ${lightMode ? 'bg-zinc-900 shadow-zinc-900/20' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'}`}>
            Davam et →
          </button>
        </div>
        </div>
        </motion.div>
        )}

        {/* ═══ STAGE: CONFIRM (Təsdiq) — read-only summary ═══ */}
        {stage === 'confirm' && (
        <motion.div key="stage-confirm"
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className={`rounded-2xl border p-4 space-y-2.5 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
            {/* 2026-09-30 (owner, round 8: "refund detalları falan olmur yoxsa
                ??"): the confirm screen now carries the ORDER identity (which
                table / order number / when), the line summary and the
                AFTER-refund remaining — before it was just method/volume/
                amount, so the cashier confirmed "₼X refund" with no context. */}
            <div className="flex items-center justify-between gap-3 pb-1.5 border-b" style={{ borderColor: lightMode ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }}>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-black truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                  {order.table_number ? `${t('table_label')} ${order.table_number}` : t('takeaway')} {order.order_number || `#${order.id.slice(0, 6)}`}
                </p>
                <p className={`text-[10px] font-bold truncate ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                  {new Date(order.created_at).toLocaleDateString('az')} {new Date(order.created_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{(order.order_items || []).length} sətir
                </p>
              </div>
              <Receipt size={16} className={`flex-shrink-0 ${lightMode ? 'text-zinc-300' : 'text-white/20'}`} />
            </div>
            {[
              { k: 'Üsul', v: refundMethod === 'cash' ? 'Nağd' : refundMethod === 'card' ? 'Kart' : refundMethod },
              { k: 'Həcm', v: mode === 'full' ? 'Tam (qalan)' : mode === 'partial' ? 'Qismən' : 'Məhsul seçimi' },
              { k: 'Məbləğ', v: `₼${(mode === 'item' ? itemTotal : refundAmount).toFixed(2)} / qalan ₼${remaining.toFixed(2)}` },
              { k: 'Qalacaq', v: `₼${Math.max(0, remaining - (mode === 'item' ? itemTotal : refundAmount)).toFixed(2)} ${remaining - (mode === 'item' ? itemTotal : refundAmount) > 0.01 ? '(təkrar refund mümkündür)' : '(sifariş tam qaytarılacaq)'}` },
              ...(mode !== 'item' && (order.order_items || []).length > 0 ? [{
                k: 'Sətirlər',
                v: (order.order_items || []).slice(0, 3).map(i => `${i.quantity}x ${i.product_name || i.products?.name_az || ''}`).join(', ') + ((order.order_items || []).length > 3 ? ' …' : ''),
              }] : []),
              ...(reason ? [{ k: 'Səbəb', v: reason }] : []),
            ].map(r => (
              <div key={r.k} className="flex items-center justify-between gap-3">
                <span className={`text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{r.k}</span>
                <span className={`text-xs font-bold text-right ${lightMode ? 'text-zinc-900' : 'text-white/85'}`}>{r.v}</span>
              </div>
            ))}
            {mode === 'item' && (
              <div className="pt-1.5 mt-1.5 border-t space-y-1.5" style={{ borderColor: lightMode ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }}>
                {Object.entries(selectedItems).map(([id, sel]) => {
                  const it = order.order_items?.find(i => i.id === id);
                  if (!it) return null;
                    return (
                      <div key={id} className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold truncate">{sel.qty}x {it.product_name}</span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">
                           {sel.fate === 'return_to_stock' ? 'Anbara qaytar' : sel.fate === 'waste' ? 'İtkiyə yaz' : 'Qeydsiz'}
                          </span>
                          <span className={`text-[10px] font-black tabular-nums ${lightMode ? 'text-zinc-700' : 'text-white/70'}`}>−₼{(Number(it.unit_price) * sel.qty).toFixed(2)}</span>
                        </span>
                      </div>
                    );
                })}
              </div>
            )}
          </div>
           {/* 2026-09-29 (owner: state transitions + icon-package rule): the
               raw "⚠" character became Phosphor TriangleAlert, and the box
               spring-POPS (it appears together with the confirm stage flip). */}
           <AnimatePresence initial={false}>
           {isFullRefund && (
             <motion.div
               key="full-warn"
               initial={{ opacity: 0, y: 6, scale: 0.98 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
               transition={SPRING.micro}
               className={`mt-3 p-3 rounded-2xl border ${lightMode ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/25'}`}
             >
               <p className={`flex items-center gap-1.5 text-[10px] font-bold ${lightMode ? 'text-red-700' : 'text-red-300'}`}>
                 <AlertTriangle size={12} className="shrink-0" /> {t('full_refund_warning') || 'Tam geri ödəniş — əməliyyat geri alınamaz'}
               </p>
             </motion.div>
           )}
           </AnimatePresence>
          <div className="mt-4 flex gap-3">
            <button onClick={goBackToEdit}
              className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
              ← Geri
            </button>
            <button onClick={submitRefund}
              className={`flex-1 py-3.5 rounded-2xl text-white text-xs font-black uppercase tracking-widest active:scale-[0.98] transition-all shadow-lg ${lightMode ? 'bg-zinc-900 shadow-zinc-900/20' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'}`}>
              {t('confirm_refund') || 'Geri qaytar'}
            </button>
          </div>
        </motion.div>
        )}

        {/* ═══ STAGE: PROCESSING — locked, close blocked ═══ */}
        {stage === 'processing' && (
          <motion.div key="stage-processing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center justify-center py-10 gap-3"
          >
            <span className={`w-10 h-10 border-[3px] rounded-full animate-spin ${lightMode ? 'border-zinc-200 border-t-zinc-900' : 'border-white/10 border-t-amber-500'}`} />
            <p className="text-sm font-black">{t('processing') || 'Geri ödəniş aparılır...'}</p>
            <p className={`text-[10px] font-semibold ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Bu adda pəncərəni bağlamayın</p>
          </motion.div>
        )}

        {/* ═══ STAGE: SUCCESS ═══ */}
        {stage === 'success' && (
          <motion.div key="stage-success"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="flex flex-col items-center justify-center py-8 gap-3"
          >
            <span className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 10.5L8.5 14L15 6.5" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <p className="text-sm font-black">{t('refund_success') || 'Geri ödəniş uğurla aparıldı'}</p>
            <p className="text-lg font-black tabular-nums text-emerald-500">₼{doneAmount.toFixed(2)}</p>
            {/* round 8: the result screen carries the same order context the
                confirm screen has — which order, by what method, and what
                remains (so a PARTIAL refund is unambiguous at a glance). */}
            <div className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>
              <span>{order.table_number ? `${t('table_label')} ${order.table_number}` : t('takeaway')} {order.order_number || `#${order.id.slice(0, 6)}`} · {refundMethod === 'cash' ? 'Nağd' : refundMethod === 'card' ? 'Kart' : refundMethod}</span>
              <span className={doneRemaining > 0.01 ? '' : 'text-emerald-500'}>
                {doneRemaining > 0.01 ? `Qalan: ₼${doneRemaining.toFixed(2)}` : 'Sifariş tam qaytarıldı'}
              </span>
            </div>
            <button onClick={guardedClose}
              className={`mt-2 px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white active:scale-[0.98] transition-all ${lightMode ? 'bg-zinc-900' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
              Bağla
            </button>
          </motion.div>
        )}

        {/* ═══ STAGE: ERROR — retry reuses the same idempotency keys ═══ */}
        {stage === 'error' && (
          <motion.div key="stage-error"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="flex flex-col items-center justify-center py-8 gap-3"
          >
            <span className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 5L13 13M13 5L5 13" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </span>
            <p className="text-sm font-black">Refund uğursuz oldu</p>
            <p className={`text-[11px] font-semibold text-center max-w-xs ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{errorMsg}</p>
            <div className="mt-2 flex gap-3 w-full max-w-xs">
              <button onClick={onClose}
                className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                Bağla
              </button>
              <button onClick={submitRefund}
                className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white text-[11px] font-black uppercase tracking-widest active:scale-[0.98] transition-all">
                Yenidən cəhd et
              </button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
