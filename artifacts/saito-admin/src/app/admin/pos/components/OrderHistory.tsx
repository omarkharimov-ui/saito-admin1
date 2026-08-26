'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Printer, X, ChevronLeft, Search, CalendarDays, RefreshCw, Split, Receipt, User, Users, Wallet, CreditCard, Package, AlertTriangle, ChevronRight, Minus } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { printReceipt, getReceiptSettings } from '@/lib/print/PrintService';
import { fastExit, slideUp } from '@/lib/modal-transitions';
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
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [reprinting, setReprinting] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pinGuardOpen, setPinGuardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ fn: () => void; action: string } | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<PaidOrder | null>(null);
  const [detailData, setDetailData] = useState<OrderDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<PaidOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'paid', limit: '100' });
      if (filter !== 'all') params.set('order_source', filter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiFetch(`/api/orders/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [filter, dateFrom, dateTo]);

  useEffect(() => {
    if (open) fetchOrders();
  }, [open, fetchOrders]);

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
    fetchOrderDetail(order);
  };

  const handleBackToList = () => {
    setSelectedOrder(null);
    setDetailData(null);
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
    switch (status) {
      case 'ready': case 'served': case 'completed': return 'text-emerald-500 bg-emerald-500/10';
      case 'preparing': case 'accepted': return 'text-amber-500 bg-amber-500/10';
      case 'voided': case 'cancelled': return 'text-red-500 bg-red-500/10 line-through';
      case 'wasted': return 'text-orange-500 bg-orange-500/10';
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

  if (!open) return null;

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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={fastExit}
        className="fixed inset-0 z-[125] flex items-end justify-center bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          {...slideUp}
          className={`relative w-full max-w-lg rounded-t-6xl shadow-overlay border ${
            lightMode ? 'bg-white/85 border-zinc-200' : 'bg-zinc-900/85 border-white/10'
          } overflow-hidden max-h-[90vh] flex flex-col backdrop-blur-lg`}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              {selectedOrder ? (
                <button onClick={handleBackToList} className="p-2 rounded-xl hover:bg-white/10 transition-all">
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all">
                  <ChevronLeft size={18} />
                </button>
              )}
              <h2 className="text-base font-black tracking-tight">
                {selectedOrder
                  ? (selectedOrder.table_number ? `${t('table_label')} ${selectedOrder.table_number}` : selectedOrder.order_source === 'takeaway' ? `${t('takeaway')}` : selectedOrder.order_source === 'delivery' ? `${t('delivery')}` : t('order_history'))
                  : t('order_history')
                }
              </h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all">
              <X size={18} />
            </button>
          </div>

          {/* ═══════ LIST VIEW ═══════ */}
          {!selectedOrder && (
            <>
              {/* Filters */}
              <div className="flex gap-2 px-5 py-3 border-b border-white/5 overflow-x-auto">
                {filters.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                      filter === f.id
                        ? 'bg-emerald-500 text-white'
                        : lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/5 text-zinc-400'
                    }`}
                  >
                    {t(f.labelKey as any)}
                  </button>
                ))}
              </div>

              {/* Search + Date Filter */}
              <div className={`px-5 py-3 border-b space-y-2 ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
                <div className="relative">
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
                <div className="flex gap-2 items-center">
                  <CalendarDays size={14} className="text-[var(--theme-text-muted)] flex-shrink-0" />
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
              </div>

              {/* Order list */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <p className="text-center text-xs opacity-40 py-12">
                    {searchQuery || dateFrom || dateTo ? t('no_search_results') : t('no_paid_orders')}
                  </p>
                ) : (
                  filteredOrders.map(order => (
                    <div
                      key={order.id}
                      onClick={() => handleSelectOrder(order)}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                        lightMode ? 'bg-zinc-50 border-zinc-100 hover:border-zinc-200' : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black tabular-nums">
                            {order.table_number ? `${t('table_label')} ${order.table_number}` : order.order_source === 'takeaway' ? `${t('takeaway_short')} ${order.order_number || ''}` : order.order_source === 'delivery' ? `${t('delivery_short')} ${order.order_number || ''}` : `#${order.order_number || order.id.slice(0, 8)}`}
                          </span>
                          <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${
                            order.order_source === 'takeaway' ? 'bg-amber-500/10 text-amber-500' :
                            order.order_source === 'delivery' ? 'bg-blue-500/10 text-blue-500' :
                            'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {order.order_source === 'takeaway' ? t('takeaway') : order.order_source === 'delivery' ? t('delivery') : t('dine_in')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs opacity-40 flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(order.created_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs opacity-40">
                            {new Date(order.created_at).toLocaleDateString('az')}
                          </span>
                          <span className="text-xs font-black tabular-nums">
                            ₼{(Number(order.paid_amount || order.total_amount) || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); guardAction(() => doReprint(order), 'reprint'); }}
                          disabled={reprinting === order.id}
                          className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 transition-all disabled:opacity-30"
                          title={t('reprint')}
                        >
                          {reprinting === order.id ? (
                            <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                          ) : (
                            <Printer size={14} />
                          )}
                        </button>
                        <ChevronRight size={16} className={lightMode ? 'text-zinc-300' : 'text-white/20'} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* ═══════ DETAIL VIEW ═══════ */}
          {selectedOrder && (
            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : detailOrder ? (
                <div className="px-5 py-4 space-y-4">

                  {/* Order info badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-lg ${
                      detailOrder.order_source === 'takeaway' ? 'bg-amber-500/10 text-amber-500' :
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
                          <span className="text-xs text-emerald-500">{t('discount_label') || 'Endirim'}</span>
                          <span className="text-xs font-bold tabular-nums text-emerald-500">−₼{Number(detailOrder.discount_amount).toFixed(2)}</span>
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
                                  <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded">PARTIAL</span>
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
                      <div className="space-y-2">
                        {auditLogs.slice(0, 20).map((log) => (
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

                  {/* Detail actions */}
                  <div className="flex gap-2 pb-4">
                    <button
                      onClick={() => guardAction(() => doReprint(detailOrder), 'reprint')}
                      disabled={reprinting === detailOrder.id}
                      className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border flex items-center justify-center gap-2 transition-all ${lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
                    >
                      <Printer size={14} /> {t('reprint') || 'Çap'}
                    </button>
                    <button
                      onClick={() => guardAction(() => openRefundModal(detailOrder), 'refund')}
                      disabled={detailOrder.status !== 'paid' || (Number(detailOrder.refund_amount) || 0) >= (Number(detailOrder.paid_amount) || 0)}
                      className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={14} /> {t('refund') || 'Geri ödəniş'}
                    </button>
                  </div>

                </div>
              ) : (
                <div className="py-16 text-center">
                  <p className="text-xs opacity-40">Sifariş tapılmadı</p>
                </div>
              )}
            </div>
          )}

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
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedItems, setSelectedItems] = useState<Record<string, { qty: number; fate: 'return_to_stock' | 'waste' | 'none' }>>({});

  const paidAmount = Number(order.paid_amount || order.total_amount) || 0;
  const totalRefunded = Number(order.refund_amount) || 0;
  const remaining = paidAmount - totalRefunded;

  useEffect(() => {
    if (mode === 'full') setAmount(remaining.toFixed(2));
    else setAmount('');
  }, [mode, remaining]);

  const refundAmount = parseFloat(amount) || 0;
  const isFullRefund = mode === 'full' || Math.abs(refundAmount - remaining) < 0.01;
  const isValid = refundAmount > 0 && refundAmount <= remaining + 0.01;

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

  const handleSubmit = async () => {
    if (mode === 'item') {
      const itemEntries = Object.entries(selectedItems);
      if (itemEntries.length === 0) {
        toast.error('Məhsul seçin');
        return;
      }
      setLoading(true);
      try {
        let allOk = true;
        for (const [itemId, sel] of itemEntries) {
          const item = order.order_items?.find(i => i.id === itemId);
          if (!item) continue;
          const itemAmount = Number(item.unit_price) * sel.qty;

          if (sel.fate === 'none') {
            const res = await apiFetch('/api/orders/refund', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: order.id,
                amount: itemAmount,
                method: order.payment_method || 'cash',
                reason: reason || 'customer_return',
              }),
            });
            if (!res.ok) {
              const err = await res.json();
              toast.error(err.error || 'Refund uğursuz oldu');
              allOk = false;
              break;
            }
          } else {
            const res = await apiFetch('/api/orders/refund', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: order.id,
                order_item_id: itemId,
                quantity: sel.qty,
                amount: itemAmount,
                method: order.payment_method || 'cash',
                item_fate: sel.fate,
                reason: reason || 'customer_return',
              }),
            });
            if (!res.ok) {
              const err = await res.json();
              toast.error(err.error || 'Refund uğursuz oldu');
              allOk = false;
              break;
            }
          }
        }
        if (allOk) {
          toast.success(t('refund_success') || 'Geri ödəniş edildi');
          onSuccess();
        }
      } catch {
        toast.error(t('error_occurred') || 'Xəta baş verdi');
      }
      setLoading(false);
    } else {
      setLoading(true);
      try {
        const res = await apiFetch('/api/orders/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: order.id,
            amount: refundAmount,
            method: order.payment_method || 'cash',
            reason: reason || 'Refund',
          }),
        });
        const data = await res.json();
        if (res.ok && data.success !== false) {
          toast.success(t('refund_success') || 'Geri ödəniş edildi');
          onSuccess();
        } else {
          toast.error(data.error || t('refund_failed') || 'Refund uğursuz oldu');
        }
      } catch {
        toast.error(t('error_occurred') || 'Xəta baş verdi');
      }
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={fastExit}
      className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-black/25 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        {...slideUp}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-elevated border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black">{t('refund') || 'Geri ödəniş'}</h3>
          <button onClick={onClose} className={`p-1.5 rounded-xl transition-all ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
            <X size={16} />
          </button>
        </div>

        {/* Paid info */}
        <div className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
          <div className="flex justify-between">
            <span className={`text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('paid_amount') || 'Ödənilən'}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('refunded') || 'Geri qaytarılan'}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-lg font-black tabular-nums">₼{paidAmount.toFixed(2)}</span>
            <span className={`text-lg font-black tabular-nums ${totalRefunded > 0 ? 'text-red-500' : ''}`}>₼{totalRefunded.toFixed(2)}</span>
          </div>
          <div className={`flex justify-between pt-1.5 mt-1.5 border-t ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
            <span className={`text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('remaining') || 'Qalan'}</span>
            <span className="text-sm font-black tabular-nums text-emerald-500">₼{remaining.toFixed(2)}</span>
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          {[
            { key: 'full' as const, label: t('full_refund') || 'Tam', desc: remaining.toFixed(2) + ' ₼' },
            { key: 'partial' as const, label: t('partial_refund') || 'Qismən', desc: '' },
            { key: 'item' as const, label: t('item_refund') || 'Məhsul', desc: '' },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 py-2.5 rounded-2xl border text-center transition-all ${
                mode === m.key
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                  : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-wider">{m.label}</p>
              {m.desc && <p className="text-[9px] mt-0.5 opacity-60">{m.desc}</p>}
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
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>₼</span>
              <input
                type="number" step="0.01" min="0" max={remaining}
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={`w-full rounded-2xl pl-9 pr-5 py-3.5 text-lg font-black outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
              />
            </div>
            {mode === 'partial' && (
              <div className="flex gap-2 mt-2">
                {[25, 50, 75].map(pct => (
                  <button key={pct} onClick={() => setAmount((remaining * pct / 100).toFixed(2))}
                    className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'}`}>
                    {pct}%
                  </button>
                ))}
                <button onClick={() => setAmount(remaining.toFixed(2))}
                  className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'}`}>
                  {t('full') || 'Tam'}
                </button>
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
                          isSelected ? 'bg-amber-500 border-amber-500' : canRefund
                            ? lightMode ? 'border-zinc-300' : 'border-white/20'
                            : 'border-zinc-300 opacity-30'
                        }`}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4 7L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold truncate ${lightMode ? 'text-black' : 'text-white'}`}>
                            {item.quantity}x {item.product_name}
                          </span>
                          {isVoided && <span className="text-[9px] text-red-500 font-bold">LƏĞV</span>}
                          {isWasted && <span className="text-[9px] text-orange-500 font-bold">İTKİ</span>}
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
                            { key: 'none' as const, icon: Package, label: 'Toxunma', color: lightMode ? 'text-zinc-500 bg-zinc-100' : 'text-white/40 bg-white/5' },
                            { key: 'return_to_stock' as const, icon: Package, label: 'Anbara qaytar', color: lightMode ? 'text-blue-600 bg-blue-50' : 'text-blue-400 bg-blue-500/10' },
                            { key: 'waste' as const, icon: AlertTriangle, label: 'İtkiyə yaz', color: lightMode ? 'text-orange-600 bg-orange-50' : 'text-orange-400 bg-orange-500/10' },
                          ].map(f => (
                            <button key={f.key} onClick={() => updateItemFate(item.id, f.key)}
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
            className={`w-full rounded-2xl px-4 py-3 text-sm font-medium outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-300 focus:border-amber-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-400/50'}`} />
        </div>

        {/* Full refund warning */}
        {isFullRefund && (
          <div className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'}`}>
            <p className={`text-[10px] font-bold ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
              ⚠ {t('full_refund_warning') || 'Tam geri ödəniş — əməliyyat geri alınamaz'}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose}
            className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
            {t('cancel') || 'Ləğv et'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (mode === 'item' ? Object.keys(selectedItems).length === 0 : !isValid)}
            className="flex-1 py-3.5 rounded-2xl bg-amber-500 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('processing') || 'Gözləyin'}
              </span>
            ) : t('confirm_refund') || 'Geri qaytar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
