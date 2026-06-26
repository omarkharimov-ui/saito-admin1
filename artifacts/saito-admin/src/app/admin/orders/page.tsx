'use client';

import React, { useState, useMemo } from 'react';
import { useOrders } from './hooks/useOrders';
import { ActiveOrderCard, ArchiveOrderCard } from './components/OrderCard';
import { OrderModal } from './components/OrderModal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Search, Filter, ShoppingBag, Clock, History, Calendar, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrdersSkeleton } from './components/OrdersSkeleton';

type FilterStatus = 'all' | 'new' | 'confirmed' | 'ready' | 'paid' | 'cancelled';
type TimeFilter = 'today' | 'week' | 'month';

export default function AdminOrdersPage() {
  const { t } = useLanguage();
  const {
    orders,
    loading,
    selectedOrder,
    setSelectedOrder,
    fetchOrders,
    handleConfirm,
    handlePay,
    handleDeleteOrder,
    handleClearTable,
    updatedLabels,
    flashIds,
    confirmedIds,
    delayThreshold,
  } = useOrders();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');

  // Filtrasiya məntiqi
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'ready') {
          if (order.kitchen_status !== 'ready') return false;
        } else if (order.status !== statusFilter) {
          return false;
        }
      }

      // Search filter (masa nömrəsi və ya ID)
      if (search.trim()) {
        const s = search.toLowerCase();
        const tableMatch = order.table_number?.toString().includes(s);
        const idMatch = order.id.toLowerCase().includes(s);
        if (!tableMatch && !idMatch) return false;
      }

      // Time filter (ödənilmiş sifarişlər üçün daha vacibdir)
      const isArchive = order.status === ('paid' as any) || order.status === ('cancelled' as any);
      if (isArchive) {
        const date = new Date(order.created_at);
        const now = new Date();
        if (timeFilter === 'today') {
          if (date.toDateString() !== now.toDateString()) return false;
        } else if (timeFilter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (date < weekAgo) return false;
        } else if (timeFilter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (date < monthAgo) return false;
        }
      }

      return true;
    });
  }, [orders, statusFilter, search, timeFilter]);

  if (loading && orders.length === 0) {
    return <OrdersSkeleton />;
  }

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto px-4 sm:px-6">
      {/* Header & Filters */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-white tracking-tight">{t('orders_title' as any) || 'Sifarişlər'}</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/25 mt-1">{filteredOrders.length} {t('order_count' as any) || 'sifariş tapıldı'}</p>
          </div>

          <div className="flex items-center gap-3">
             <div className="relative flex-1 sm:w-64">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  type="text"
                  placeholder={t('search_placeholder' as any) || 'Masa və ya ID axtar...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-gold/30 transition-all"
                />
             </div>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: t('all' as any) || 'Hamısı', icon: <ShoppingBag size={14} /> },
            { id: 'new', label: t('new' as any) || 'Yeni', icon: <Zap size={14} /> },
            { id: 'confirmed', label: t('confirmed' as any) || 'Təsdiqli', icon: <Clock size={14} /> },
            { id: 'ready', label: t('ready' as any) || 'Hazır', icon: <History size={14} /> },
            { id: 'paid', label: t('paid' as any) || 'Ödənilmiş', icon: <Calendar size={14} /> },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as FilterStatus)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                statusFilter === f.id
                  ? 'bg-gold text-black border-gold shadow-lg shadow-gold/10'
                  : 'bg-white/[0.03] text-white/40 border-white/[0.08] hover:border-white/20 hover:text-white'
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}

          {statusFilter === 'paid' && (
            <div className="flex bg-white/[0.03] border border-white/[0.08] rounded-xl p-1 ml-auto">
                {['today', 'week', 'month'].map((tf) => (
                    <button
                        key={tf}
                        onClick={() => setTimeFilter(tf as TimeFilter)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            timeFilter === tf ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'
                        }`}
                    >
                        {tf === 'today' ? 'Bugün' : tf === 'week' ? 'Həftə' : 'Ay'}
                    </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-white/[0.05] rounded-[32px] bg-white/[0.01]">
          <ShoppingBag size={48} className="text-white/[0.05] mb-4" />
          <h3 className="text-lg font-medium text-white/40">{t('no_orders' as any) || 'Sifariş tapılmadı'}</h3>
          <p className="text-sm text-white/20 mt-1">{t('try_different_filter' as any) || 'Filtrləri dəyişərək yenidən yoxlayın'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredOrders.map((order) => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                {order.status === 'paid' || order.status === 'cancelled' ? (
                  <ArchiveOrderCard
                    order={order}
                    onClick={() => setSelectedOrder(order)}
                  />
                ) : (
                  <ActiveOrderCard
                    order={order}
                    allOrders={orders}
                    updatedLabels={updatedLabels}
                    flashIds={flashIds}
                    confirmedIds={confirmedIds}
                    delayThreshold={delayThreshold}
                    onClick={() => setSelectedOrder(order)}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onRefresh={fetchOrders}
          onPay={(o) => handlePay(o)}
          onConfirm={handleConfirm}
          onClearTable={handleClearTable}
          onDelete={handleDeleteOrder}
          allOrders={orders}
        />
      )}
    </div>
  );
}
