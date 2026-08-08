'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Printer, X, ChevronLeft, Search, CalendarDays, RefreshCw, Split, Ban, Receipt } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { printReceipt, getReceiptSettings } from '@/lib/print/PrintService';
import { appleCard, appleBackdrop, fastExit } from '@/lib/modal-transitions';
import { PinGuard } from './PinGuard';
import { isAtLeast, requiresPin } from '@/lib/pos-permissions';
import { toast } from '@/lib/toast';

interface PaidOrder {
  id: string;
  table_number: number | null;
  order_number: string | null;
  order_source: string | null;
  total_amount: number;
  paid_amount: number | null;
  payment_method: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  order_items: {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    variant_id: string | null;
    modifiers: string | any[];
    special_notes: string | null;
    combo_group_id: string | null;
    products?: { name_az?: string; name_en?: string };
  }[];
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
  const [refunding, setRefunding] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [pinGuardOpen, setPinGuardOpen] = useState(false);
  const [pendingReprint, setPendingReprint] = useState<PaidOrder | null>(null);
  const [pendingRefund, setPendingRefund] = useState<PaidOrder | null>(null);
  const [pendingSplit, setPendingSplit] = useState<PaidOrder | null>(null);
  const [filter, setFilter] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  const filteredOrders = orders.filter(order => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const orderLabel = order.table_number ? `${t('table_label')} ${order.table_number}` : order.order_source === 'takeaway' ? `${t('takeaway_short')} ${order.order_number || ''}` : order.order_source === 'delivery' ? `${t('delivery_short')} ${order.order_number || ''}` : `#${order.order_number || order.id.slice(0, 8)}`;
    const itemNames = (order.order_items || []).map(i => i.product_name || i.products?.name_az || '').join(' ').toLowerCase();
    const customerName = (order.customer_name || '').toLowerCase();
    return orderLabel.includes(q) || itemNames.includes(q) || customerName.includes(q);
  });

  const handleReprint = async (order: PaidOrder) => {
    const posRoleNorm = posRole?.toLowerCase() || '';
    if (requiresPin(posRoleNorm)) {
      setPendingReprint(order);
      setPinGuardOpen(true);
      return;
    }
    await doReprint(order);
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
        subtotal: Number(order.total_amount) || 0,
        discount: 0,
        tip: 0,
        total: Number(order.paid_amount || order.total_amount) || 0,
        paymentMethod: order.payment_method || 'cash',
        cashAmount: order.payment_method === 'cash' ? Number(order.paid_amount || order.total_amount) || 0 : 0,
        cardAmount: order.payment_method === 'card' ? Number(order.paid_amount || order.total_amount) || 0 : 0,
        date: order.created_at,
        time: order.created_at,
        paperWidth: settings.paperWidth,
        copies: settings.copies,
      });
    } catch { /* silent */ }
    setTimeout(() => setReprinting(null), 1500);
  };

  const handleRefund = async (order: PaidOrder) => {
    const posRoleNorm = posRole?.toLowerCase() || '';
    if (requiresPin(posRoleNorm)) {
      setPendingRefund(order);
      setPinGuardOpen(true);
      return;
    }
    await doRefund(order);
  };

  const doRefund = async (order: PaidOrder) => {
    setRefunding(order.id);
    try {
      const res = await apiFetch('/api/orders/complete-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          payments: [{
            method: order.payment_method || 'cash',
            amount: Number(order.paid_amount || order.total_amount) || 0,
            is_refund: true,
          }],
        }),
      });
      if (res.ok) {
        toast.success(t('refund_success'));
        fetchOrders();
      } else {
        const err = await res.json();
        toast.error(err.error || t('refund_failed'));
      }
    } catch { toast.error(t('error_occurred')); }
      setTimeout(() => setRefunding(null), 1500);
    };

    const handleSplit = async (order: PaidOrder) => {
    const posRoleNorm = posRole?.toLowerCase() || '';
    if (requiresPin(posRoleNorm)) {
      setPendingSplit(order);
      setPinGuardOpen(true);
      return;
    }
    await doSplit(order);
  };

  const doSplit = async (order: PaidOrder) => {
    setSplitting(order.id);
    try {
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
      const res = await apiFetch('/api/orders/bill-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_order_id: order.id,
          items_to_split,
        }),
      });
      if (res.ok) {
        toast.success(t('order_split'));
        fetchOrders();
      } else {
        const err = await res.json();
        toast.error(err.error || t('split_failed'));
      }
    } catch { toast.error(t('error_occurred')); }
    setTimeout(() => setSplitting(null), 1500);
  };

  if (!open) return null;

  const filters = [
    { id: 'all', labelKey: 'all_products' },
    { id: 'dine_in', labelKey: 'dine_in' },
    { id: 'takeaway', labelKey: 'takeaway' },
    { id: 'delivery', labelKey: 'delivery' },
  ];

  return (
    <AnimatePresence>
      <motion.div
        key="order-history-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fastExit}
        className="fixed inset-0 z-[125] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        {...appleCard}
        transition={fastExit}
        className={`relative w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col ${
          lightMode ? 'bg-white' : 'bg-zinc-900'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all">
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-base font-black tracking-tight">{t('order_history')}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-5 py-3 border-b border-white/5 overflow-x-auto">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
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
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold outline-none border transition-all ${
                lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-700' : 'bg-white/5 border-white/10 text-zinc-300'
              }`}
            />
            <span className={`text-[10px] font-bold ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold outline-none border transition-all ${
                lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-700' : 'bg-white/5 border-white/10 text-zinc-300'
              }`}
            />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 transition-colors">
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
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                  lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tabular-nums">
                       {order.table_number ? `${t('table_label')} ${order.table_number}` : order.order_source === 'takeaway' ? `${t('takeaway_short')} ${order.order_number || ''}` : order.order_source === 'delivery' ? `${t('delivery_short')} ${order.order_number || ''}` : `#${order.order_number || order.id.slice(0, 8)}`}
                    </span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      order.order_source === 'takeaway' ? 'bg-amber-500/10 text-amber-500' :
                      order.order_source === 'delivery' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-emerald-500/10 text-emerald-500'
                    }`}>
                       {order.order_source === 'takeaway' ? t('takeaway') : order.order_source === 'delivery' ? t('delivery') : t('dine_in')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] opacity-40 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(order.created_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[10px] opacity-40">
                      {new Date(order.created_at).toLocaleDateString('az')}
                    </span>
                    <span className="text-xs font-black tabular-nums">
                      ₼{(Number(order.paid_amount || order.total_amount) || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                 <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={() => handleReprint(order)}
                      disabled={reprinting === order.id}
                      className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 transition-all disabled:opacity-30"
                      title={t('reprint')}
                    >
                      {reprinting === order.id ? (
                        <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                      ) : (
                        <Printer size={16} />
                      )}
                    </button>
                    <button
                      onClick={() => handleRefund(order)}
                      disabled={refunding === order.id}
                      className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all disabled:opacity-30"
                      title={t('refund')}
                    >
                      {refunding === order.id ? (
                        <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                    </button>
                    <button
                      onClick={() => handleSplit(order)}
                      disabled={splitting === order.id}
                      className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 hover:bg-blue-500/20 transition-all disabled:opacity-30"
                      title={t('split')}
                    >
                      {splitting === order.id ? (
                        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      ) : (
                        <Split size={16} />
                      )}
                    </button>
                  </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
      <PinGuard
        open={pinGuardOpen}
        onClose={() => { setPinGuardOpen(false); setPendingReprint(null); setPendingRefund(null); setPendingSplit(null); }}
        onVerified={() => {
          if (pendingReprint) doReprint(pendingReprint);
          else if (pendingRefund) doRefund(pendingRefund);
          else if (pendingSplit) doSplit(pendingSplit);
        }}
        action={pendingRefund ? 'refund' : pendingSplit ? 'split' : 'reprint'}
      />
    </motion.div>
    </AnimatePresence>
  );
}
