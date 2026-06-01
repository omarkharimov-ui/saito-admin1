'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList, WifiOff, Archive, Filter, AlertTriangle, Trash2, Calendar, X, BellRing, Maximize2, Minimize2,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useOrders } from './hooks/useOrders';
import { GoldSpinner } from './components/GoldSpinner';
import { RowSkeleton } from '@/components/SkeletonLoader';
import { OrdersGhostLoading } from './components/OrdersGhostLoading';
import { TableStatusGrid } from './components/TableStatusGrid';
import { ActiveOrderCard, ArchiveOrderCard } from './components/OrderCard';
import { OrderModal } from './components/OrderModal';

import { ReceiptModal } from './components/ReceiptModal';
import GoldCalendar from '@/components/GoldCalendar';
import { ManualOrderModal } from './components/ManualOrderModal';
import type { TabKey, TableFilterType, Order } from './types';
import { getOrderAgeMinutes } from './utils';

function getCookieRole(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').find((c) => c.trim().startsWith('saito_role='));
  return match ? match.trim().split('=')[1] : null;
}

export default function OrdersPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { notifications, markAsRead } = useNotifications();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const go = () => {
      if (!mq.matches) return;
      const role = getCookieRole();
      router.replace(role === 'superadmin' ? '/stats' : '/');
    };
    go();
    mq.addEventListener('change', go);
    return () => mq.removeEventListener('change', go);
  }, [router]);

  const {
    orders, setOrders, loading, tableCount, delayThreshold, isOnline,
    selectedOrder, setSelectedOrder,

    updatedLabels, flashIds, confirmedIds, setConfirmedIds,
    staleDismissed, setStaleDismissed, prevStaleKey,
    fetchOrders,
    handleConfirm, handlePay, handleDeleteOrder, handleClearTable, handleMergeOrders, handleMoveOrder, handleAddEmptyTable, handleCreateMergedEmptyOrder,
    handleStartPreparing, handleMarkReady,
  } = useOrders();

  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const [tab, setTab]                 = useState<TabKey>('active');
  const [kitchenTab, setKitchenTab]   = useState<'pending' | 'preparing' | 'ready'>('pending');
  const [tableFilter, setTableFilter] = useState<TableFilterType>('all');
  const [isTableDragging, setIsTableDragging] = useState(false);

  const [archiveFilter, setArchiveFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all'>('today');
  const [dateRange, setDateRange]         = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker]         = useState(false);
  const [showArchiveFilters, setShowArchiveFilters] = useState(false);
  const [clearingArchive, setClearingArchive]       = useState(false);
  const [confirmClearArchive, setConfirmClearArchive] = useState(false);
  const [manualModalTable, setManualModalTable] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [pageCategories, setPageCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from('categories').select('*').order('sort_order').then(({ data }) => {
      if (data) setPageCategories(data);
    });
  }, []);

  useEffect(() => {
    let style: HTMLStyleElement | null = null;
    const handler = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreen(isFs);
      if (isFs && !style) {
        style = document.createElement('style');
        style.id = 'fs-sidebar';
        style.textContent = `div[style*="width: 272"] { display: none !important; } main { margin-left: 0 !important; }`;
        document.head.appendChild(style);
      } else if (!isFs && style) {
        style.remove();
        style = null;
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      if (style) style.remove();
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }, []);

  const [dismissedReadyIds, setDismissedReadyIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('dismissedReadyIds');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const prevReadyKey = useRef('');

  React.useEffect(() => {
    notifications.filter(n => n.type === 'order' && !n.isRead).forEach(n => markAsRead(n.id));
  }, [notifications, markAsRead]);

  const activeOrders = useMemo(() => orders.filter(o => {
    if (o.status === 'paid') return false;
    // Don't show served/dismissed orders
    if (o.is_served) return false;
    // Don't show empty placeholder orders as cards (merged child with no items)
    if (o.merged_into && (!o.order_items || o.order_items.length === 0)) return false;
    return true;
  }), [orders]);
  const newCount     = useMemo(() => orders.filter(o => o.status === 'new').length, [orders]);
  const tableNumbers = useMemo(() => Array.from({ length: tableCount }, (_, i) => i + 1), [tableCount]);
  const activeOrdersForNav = activeOrders.filter(o => o.status !== 'paid');
  const handleSelectTable = useCallback((tableNum: number) => {
    const order = activeOrders.find(o => o.table_number === tableNum);
    if (order) {
      setSelectedOrder(order);
      setManualModalTable(null);
    } else {
      setManualModalTable(tableNum);
      setSelectedOrder(null);
    }
  }, [activeOrders]);

  const handleDismissReady = useCallback(async (orderId: string) => {
    // Find the order and its merged children
    const order = activeOrders.find(o => o.id === orderId);
    const mergedChildIds = order?.merged_orders?.map(child => child.id) || [];
    
    // Add all related order IDs to dismissed set
    const allIdsToDismiss = [orderId, ...mergedChildIds];
    setDismissedReadyIds(prev => {
      const next = new Set(prev);
      allIdsToDismiss.forEach(id => next.add(id));
      try { localStorage.setItem('dismissedReadyIds', JSON.stringify([...next])); } catch {}
      return next;
    });
    
    // Update database for all related orders
    await supabase.from('orders').update({ is_served: true }).in('id', allIdsToDismiss);
  }, [activeOrders]);

  const handleDismissAllReady = useCallback(async (ids: string[]) => {
    // Collect all order IDs including merged children
    const allIdsToDismiss = new Set<string>();
    
    ids.forEach(id => {
      allIdsToDismiss.add(id);
      const order = activeOrders.find(o => o.id === id);
      const mergedChildIds = order?.merged_orders?.map(child => child.id) || [];
      mergedChildIds.forEach(childId => allIdsToDismiss.add(childId));
    });
    
    // Stagger: dismiss one by one with 100ms delay
    const allIds = Array.from(allIdsToDismiss);
    for (let i = 0; i < allIds.length; i++) {
      await new Promise(res => setTimeout(res, i === 0 ? 0 : 100));
      setDismissedReadyIds(prev => {
        const next = new Set(prev).add(allIds[i]);
        try { localStorage.setItem('dismissedReadyIds', JSON.stringify([...next])); } catch {}
        return next;
      });
    }
    
    if (allIds.length > 0) {
      await supabase.from('orders').update({ is_served: true }).in('id', allIds);
    }
  }, [activeOrders]);

  const staleOrders = activeOrders.filter(o => {
    if (o.status === 'paid') return false;
    if (o.kitchen_accepted_at) return false;
    if (getOrderAgeMinutes(o.created_at) < 15) return false;
    // Məhsulsuz orderləri banner-dən xaric et
    if (!o.order_items || o.order_items.length === 0) return false;
    return true;
  });

  // Calculate group number for merged orders in stale banner
  const getStaleGroupNumber = (order: Order) => {
    if (!order.merged_orders || order.merged_orders.length === 0) return 0;
    // Get all active merged parents sorted by creation date
    const allMergedParents = activeOrders
      .filter(o => o.merged_orders && o.merged_orders.length > 0 && o.table_number !== null)
      .sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeA - timeB;
      });
    const index = allMergedParents.findIndex(o => o.id === order.id);
    return index >= 0 ? index + 1 : 1;
  };

  // Get proper stale orders display text
  const getStaleOrdersText = () => {
    if (staleOrders.length === 0) return '';
    
    if (staleOrders.length === 1) {
      const order = staleOrders[0];
      if (order.merged_orders && order.merged_orders.length > 0) {
        return `${t('stale_group')} ${getStaleGroupNumber(order)} — ${t('stale_not_accepted')}`;
      } else {
        return `${t('stale_table')} ${order.table_number} — ${t('stale_not_accepted')}`;
      }
    }
    
    // For multiple orders, check if they are all from the same group
    const mergedGroups = staleOrders.filter(o => o.merged_orders && o.merged_orders.length > 0);
    const individualTables = staleOrders.filter(o => !o.merged_orders || o.merged_orders.length === 0);
    
    if (mergedGroups.length > 0 && individualTables.length === 0) {
      // All are merged groups
      if (mergedGroups.length === 1) {
        return `${t('stale_group')} ${getStaleGroupNumber(mergedGroups[0])} — ${t('stale_not_accepted')}`;
      }
      return `${mergedGroups.length} ${t('stale_groups_not_accepted')}`;
    }
    
    if (individualTables.length > 0 && mergedGroups.length === 0) {
      // All are individual tables
      return `${staleOrders.length} ${t('stale_orders_not_accepted')}`;
    }
    
    // Mixed case
    return `${staleOrders.length} ${t('stale_orders_not_accepted')}`;
  };
  const staleKey = staleOrders.map(o => o.id).sort().join(',');
  if (prevStaleKey.current !== staleKey) {
    prevStaleKey.current = staleKey;
    if (staleKey !== '') setStaleDismissed(false);
  }

  const readyOrders = useMemo(() => 
    activeOrders
      .filter(o => o.kitchen_status === 'ready')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [activeOrders]
  );
  const readyKey = readyOrders.map(o => o.id).sort().join(',');
  const visibleReadyOrders = useMemo(() => 
    readyOrders.filter(o => {
      // Check if parent order is dismissed or served
      if (dismissedReadyIds.has(o.id) || o.is_served) return false;
      
      // Check if any of the merged children are dismissed
      if (o.merged_orders && o.merged_orders.length > 0) {
        const hasDismissedChild = o.merged_orders.some(child => 
          dismissedReadyIds.has(child.id)
        );
        if (hasDismissedChild) return false;
      }
      
      // Check if this order is a child of a dismissed parent
      const isChildOfDismissedParent = readyOrders.some(parent => 
        parent.merged_orders?.some(child => child.id === o.id) && 
        (dismissedReadyIds.has(parent.id) || parent.is_served)
      );
      
      return !isChildOfDismissedParent;
    }),
    [readyOrders, dismissedReadyIds]
  );

  const prevReadyKeyRef = prevReadyKey;
  useEffect(() => {
    const newIds = readyOrders.map(o => o.id).sort().join(',');
    if (prevReadyKeyRef.current !== newIds) {
      const added = readyOrders.filter(o => !prevReadyKeyRef.current.split(',').filter(Boolean).includes(o.id));
      prevReadyKeyRef.current = newIds;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey]);

  const getArchiveFiltered = () => {
    const paid = orders.filter(o => o.status === 'paid');
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (archiveFilter === 'custom' && dateRange.start && dateRange.end)
      return paid.filter(o => { const d = new Date(o.created_at); return d >= dateRange.start! && d <= dateRange.end!; });
    switch (archiveFilter) {
      case 'today':     return paid.filter(o => new Date(o.created_at) >= today);
      case 'yesterday': return paid.filter(o => { const d = new Date(o.created_at); return d >= yesterday && d < today; });
      case 'week':      { const w = new Date(today); w.setDate(w.getDate() - 7); return paid.filter(o => new Date(o.created_at) >= w); }
      case 'month':     { const m = new Date(today); m.setDate(m.getDate() - 30); return paid.filter(o => new Date(o.created_at) >= m); }
      default:          return paid;
    }
  };

  const filtered = useMemo(() => {
    if (tab === 'archive') return getArchiveFiltered();
    return orders
      .filter(o => {
        if (o.status === 'paid') return false;
        // Filter out child orders (merged into another order) - only show parent groups
        if (o.merged_into !== null && o.merged_into !== undefined) return false;
        if (tableFilter === 'empty')  return o.status === 'new' && !o.order_items?.length;
        if (tableFilter === 'new')    return o.status === 'new' && !!o.order_items?.length;
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, tab, tableFilter, archiveFilter, dateRange]);

  const handleClearArchive = async () => {
    setClearingArchive(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { toast }    = await import('react-hot-toast');
      const paidIds = getArchiveFiltered().map(o => o.id);
      if (!paidIds.length) return;
      await supabase.from('order_items').delete().in('order_id', paidIds);
      const { error } = await supabase.from('orders').delete().in('id', paidIds);
      if (error) throw error;
      fetchOrders();
      toast.success(t('archive_cleared'), { id: 'action-toast' });
    } catch (e: any) {
      const { toast } = await import('react-hot-toast');
      toast.error(e?.message || t('error'), { id: 'action-toast' });
    } finally {
      setClearingArchive(false);
      setConfirmClearArchive(false);
    }
  };

  const archiveFilterLabels: Record<string, string> = {
    today: t('today'), yesterday: t('yesterday'), week: t('this_week'),
    month: t('this_month'), custom: t('selected_date'), all: t('all_archive'),
  };

  return (
    <div>
      {/* Confirm clear archive */}
      {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {confirmClearArchive && tab === 'archive' && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 backdrop-blur-sm p-4"
            onClick={() => !clearingArchive && setConfirmClearArchive(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.18 }}
              className="w-full max-w-full sm:max-w-md bg-[#0f0f0f] border border-red-500/30 p-8 shadow-2xl rounded-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button disabled={clearingArchive} onClick={() => setConfirmClearArchive(false)}
                className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all disabled:opacity-40">
                <X size={16} />
              </button>
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                  <Trash2 size={28} className="text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{t('clear_archive')}</h3>
                <p className="text-white/60 text-sm mb-6">{t('confirm_clear_archive')}</p>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setConfirmClearArchive(false)} disabled={clearingArchive}
                    className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                    {t('no')}
                  </button>
                  <button onClick={handleClearArchive} disabled={clearingArchive}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                    <Trash2 size={16} /> {t('yes_delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}

      {/* Stale orders banner */}
      <AnimatePresence>
        {staleOrders.length > 0 && !staleDismissed && (
          <motion.div
            key={staleKey}
            drag="x" dragConstraints={{ left: 0, right: 400 }} dragElastic={0.1}
            onDragEnd={(_e, info) => { if (info.offset.x > 60 || info.velocity.x > 300) setStaleDismissed(true); }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 400 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2.5 px-4 py-2.5 mb-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm cursor-grab active:cursor-grabbing select-none"
          >
            <AlertTriangle size={15} className="flex-shrink-0 animate-pulse" />
            <span className="font-semibold flex-1">
              {getStaleOrdersText()}
            </span>
            <button onClick={() => setStaleDismissed(true)}
              className="ml-2 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Ready Orders Notification System */}
      {createPortal(
        <div className="fixed top-5 right-5 z-[9999] flex flex-col items-end gap-3 pointer-events-none" style={{ maxWidth: 360 }}>
          {/* Dismiss all button at the top */}
          <AnimatePresence>
            {visibleReadyOrders.length >= 2 && (
              <motion.button
                key="dismiss-all"
                layout
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -8 }}
                onClick={() => handleDismissAllReady(readyOrders.map(o => o.id))}
                className="pointer-events-auto px-3 py-1.5 rounded-lg bg-white/[0.08] backdrop-blur-sm border border-white/25 text-white/60 hover:text-white hover:border-white/40 text-[10px] font-semibold transition-all duration-200 hover:scale-105 shadow-lg"
              >
                {t('ready_notif_dismiss_all')}
              </motion.button>
            )}
          </AnimatePresence>
          
          <AnimatePresence mode="popLayout">
            {visibleReadyOrders.map((order, index) => (
              <motion.div
                key={order.id}
                layout
                drag="x"
                dragConstraints={{ left: -320, right: 0 }}
                dragElastic={0.15}
                onDragEnd={(_e, info) => {
                  if (info.offset.x < -60 || info.velocity.x < -300) {
                    setDismissedReadyIds(prev => new Set(prev).add(order.id));
                  }
                }}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  y: 0, 
                  scale: 1,
                  transition: { 
                    type: "spring", 
                    stiffness: 400, 
                    damping: 30,
                    delay: index * 0.05 
                  }
                }}
                exit={{ 
                  opacity: 0,
                  x: 60,
                  scale: 0.92,
                  transition: { duration: 0.22, ease: 'easeIn' }
                }}
                whileHover={{ 
                  scale: 1.02,
                  transition: { duration: 0.15 }
                }}
                className="pointer-events-auto relative group"
                style={{ zIndex: 1000 - index }}
              >
                {/* Subtle backdrop blur for depth */}
                <motion.div
                  layoutId={`backdrop-${order.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 -inset-3 bg-black/20 backdrop-blur-sm rounded-2xl pointer-events-none z-[-1]"
                />
                
                {/* Main notification card */}
                <div className="relative flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-black/70 backdrop-blur-md border border-gold/20 text-gold text-sm shadow-[0_8px_32px_rgba(212,175,55,0.15),0_4px_12px_rgba(0,0,0,0.4)] cursor-grab active:cursor-grabbing select-none overflow-hidden">
                  {/* Gradient accent on left */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-gold/60 via-gold to-gold/60 rounded-l-2xl" />
                  
                  {/* Icon with pulse */}
                  <div className="flex-shrink-0 relative">
                    <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center">
                      <BellRing size={16} className="text-gold animate-pulse" />
                    </div>
                    {/* Subtle pulse ring */}
                    <div className="absolute inset-0 rounded-xl border border-gold/20 animate-ping opacity-30" />
                  </div>
                  
                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gold/90 text-[13px] leading-snug block">
                      {(order.merged_orders && order.merged_orders.length > 0)
                        ? `${t('ready_notif_group')} — ${t('ready_for_service')}!`
                        : `${t('ready_notif_table')} ${order.table_number} — ${t('ready_for_service')}!`}
                    </span>
                    <span className="text-gold/50 text-[11px] mt-0.5 block">
                      {new Date(order.created_at).toLocaleTimeString('az-AZ', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  
                  <button
                    onClick={() => handleDismissReady(order.id)}
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 text-gold/40"
                  >
                    <X size={13} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}

      {/* Offline banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 px-4 py-2.5 mb-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
            <WifiOff size={15} className="flex-shrink-0" />
            <span>{t('offline_message')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sifarişlər title + Aktiv/Arxiv tabs */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-xl md:text-3xl font-serif font-bold text-white leading-tight truncate">{t('orders')}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative flex rounded-xl p-1 bg-white/[0.04] border border-white/[0.07]">
            {(['active', 'archive'] as TabKey[]).map(key => (
              <button key={key} onClick={() => setTab(key)}
                className={`relative z-10 px-5 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 ${tab === key ? 'text-white font-semibold' : 'text-white/50 hover:text-white/80'}`}>
                {tab === key && (
                  <motion.span layoutId="orderTabIndicator" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-white/[0.07] border border-white/[0.15]" />
                )}
                <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                  {key === 'archive' && <Archive size={14} strokeWidth={1.5} />}
                  {key === 'active' ? t('tab_active') : t('tab_archive')}
                  {key === 'active' && newCount > 0 && <span className="w-2 h-2 rounded-full bg-gold/70 animate-pulse" />}
                </span>
              </button>
            ))}
          </div>
          <button onClick={toggleFullscreen}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 border bg-white/[0.04] text-white/50 border-white/[0.07] hover:text-white/80">
            {fullscreen ? <Minimize2 size={15} strokeWidth={1.5} /> : <Maximize2 size={15} strokeWidth={1.5} />}
          </button>
          {tab === 'archive' && filtered.length > 0 && (
            <motion.button
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
              onClick={() => setConfirmClearArchive(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white/35 hover:text-red-400 border border-white/[0.08] hover:border-red-500/25 hover:bg-red-500/[0.05] transition-all duration-200">
              <Trash2 size={14} /> <span className="hidden sm:inline">{archiveFilterLabels[archiveFilter] ?? t('clear_archive')}</span>
            </motion.button>
          )}
        </div>
      </div>

      {tab === 'archive' && (
        <div className="mb-4">
          {/* Archive filters dropdown */}
          <div className="relative">
            <button onClick={() => setShowArchiveFilters(v => !v)}
              className="flex items-center gap-2.5 px-5 h-11 rounded-xl text-sm font-medium bg-white/[0.05] backdrop-blur-md border border-white/[0.1] text-white/50 hover:text-white hover:bg-white/[0.09] transition-all duration-200">
              <Filter size={15} strokeWidth={1.5} /> {t('filter')}
            </button>
            <AnimatePresence>
              {showArchiveFilters && (
                <>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[110]"
                    onClick={() => { setShowArchiveFilters(false); setShowDatePicker(false); }} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.18 }}
                    className="absolute right-0 mt-2 z-[111] w-[calc(100vw-2rem)] sm:w-[420px] bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-visible"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                      <p className="text-white/80 text-xs font-semibold uppercase tracking-widest">{t('filter')}</p>
                      <button onClick={() => { setShowArchiveFilters(false); setShowDatePicker(false); }}
                        className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-white/35">{t('filter')}</p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {(['today', 'yesterday', 'week', 'month', 'all'] as const).map(f => (
                            <button key={f} onClick={() => { setArchiveFilter(f); setShowDatePicker(false); setShowArchiveFilters(false); }}
                              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${archiveFilter === f ? 'bg-white/[0.1] text-white border-white/25' : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white'}`}>
                              {archiveFilterLabels[f]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-white/35">{t('custom_date')}</p>
                        <button onClick={() => setShowDatePicker(true)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${archiveFilter === 'custom' ? 'bg-white/[0.1] text-white border-white/25' : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white'}`}>
                          <span>{t('selected_date')}</span><Calendar size={15} />
                        </button>
                      </div>
                      {showDatePicker && (
                        <div className="pt-2 border-t border-white/10 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-white/40 uppercase tracking-wider">{t('start')}</label>
                              <GoldCalendar
                                value={dateRange.start?.toISOString().split('T')[0] || ''}
                                onChange={val => setDateRange(prev => ({ ...prev, start: val ? new Date(val) : null }))}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-white/40 uppercase tracking-wider">{t('end')}</label>
                              <GoldCalendar
                                value={dateRange.end?.toISOString().split('T')[0] || ''}
                                min={dateRange.start?.toISOString().split('T')[0] || ''}
                                onChange={val => setDateRange(prev => ({ ...prev, end: val ? new Date(val) : null }))}
                              />
                            </div>
                          </div>
                          <button onClick={() => { setArchiveFilter('custom'); setShowArchiveFilters(false); setShowDatePicker(false); }}
                            disabled={!dateRange.start || !dateRange.end}
                            className="w-full py-3 rounded-xl bg-white/[0.1] border border-white/20 text-white text-sm font-bold tracking-widest uppercase disabled:opacity-40 transition-colors hover:bg-white/[0.15]">
                            {t('apply')}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Category pills — only on active tab */}
      {tab === 'active' && pageCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto mb-5 -mx-8 px-8 pb-1">
          {pageCategories.map(c => (
            <button key={c.id}
              className="flex-shrink-0 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider whitespace-nowrap transition-all bg-white/[0.06] text-white/50 hover:text-white/80">
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Table status grid */}
      {tab === 'active' && (
        <TableStatusGrid
          key="table-grid"
          orders={activeOrders}
          allOrders={orders}
          onTableClick={setSelectedOrder}
          onClearTable={handleClearTable}
          onEmptyTableClick={(n) => setManualModalTable(n)}
          tableCount={tableCount}
          tableFilter={tableFilter}
          setTableFilter={setTableFilter}
          loading={loading}
          t={t}
          delayThreshold={delayThreshold}
          onMergeTables={handleMergeOrders}
          onMoveTable={handleMoveOrder}
          onAddEmptyTable={handleAddEmptyTable}
          onDragStateChange={setIsTableDragging}
          onEmptyMerge={handleCreateMergedEmptyOrder}
        />
      )}

      {/* Order cards OR manual order (when table selected) */}
      {manualModalTable ? (
        <div className="mt-4">
          <ManualOrderModal
            key={manualModalTable}
            tableNum={manualModalTable}
            tableNumbers={tableNumbers}
            activeOrders={activeOrders}
            onClose={() => setManualModalTable(null)}
            onCreated={() => { setManualModalTable(null); fetchOrders(); }}
            onSwitchTable={setManualModalTable}
            onSelectTable={handleSelectTable}
          />
        </div>
      ) : selectedOrder && selectedOrder.status !== 'paid' && tab === 'active' ? (
        <div className="mt-4 h-[calc(100vh-120px)] overflow-hidden">
          <OrderModal
            key={selectedOrder.id}
            order={selectedOrder}
            allActiveOrders={activeOrdersForNav}
            onSwitchOrder={(o) => setSelectedOrder(o)}
            tableNumbers={tableNumbers}
            onSelectTable={handleSelectTable}
            inline
            onClose={() => setSelectedOrder(null)}
            onRefresh={fetchOrders}
            onConfirm={handleConfirm}
            onPay={async (order) => {
              setReceiptOrder(order);
              setSelectedOrder(null);
            }}
            onClearTable={handleClearTable}
            onDelete={handleDeleteOrder}
            allOrders={orders}
            onOrdersUpdate={(updater) => setOrders(prev => {
              const next = updater(prev);
              try { localStorage.setItem('saito_orders_cache', JSON.stringify(next)); } catch {}
              setSelectedOrder(sel => sel ? (next.find(o => o.id === sel.id) ?? sel) : null);
              return next;
            })}
          />
        </div>
      ) : loading ? (
        <div className="mt-4">
          <OrdersGhostLoading />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 select-none">
            <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-5">
              <ClipboardList size={32} className="text-white/10" />
            </div>
            <p className="text-white/30 text-sm font-medium">
              {tab === 'active' ? t('no_active_orders') : t('no_archive_orders')}
            </p>
            <p className="text-white/15 text-xs mt-1">
              {tab === 'active' ? t('new_orders_will_appear') : ''}
            </p>
          </motion.div>
        </div>
      ) : tab === 'active' ? (() => {
          const pendingOrders   = filtered.filter(o => o.status === 'new' || (o.status === 'confirmed' && !o.kitchen_accepted_at));
          const preparingOrders = filtered.filter(o => o.kitchen_status === 'cooking' || o.kitchen_status === 'preparing');
          const readyOrders     = filtered.filter(o => o.kitchen_status === 'ready');

          const KITCHEN_TABS = [
            { key: 'pending'   as const, label: t('kitchen_tab_pending'),   count: pendingOrders.length,   dot: 'bg-orange-500 animate-pulse', text: 'text-orange-400',  inactive: 'text-orange-400/40 hover:text-orange-400/70'  },
            { key: 'preparing' as const, label: t('kitchen_tab_preparing'), count: preparingOrders.length, dot: 'bg-blue-400 animate-pulse',   text: 'text-blue-400',    inactive: 'text-blue-400/40 hover:text-blue-400/70'      },
            { key: 'ready'     as const, label: t('kitchen_tab_ready'),     count: readyOrders.length,     dot: 'bg-emerald-400',              text: 'text-emerald-400', inactive: 'text-emerald-400/40 hover:text-emerald-400/70' },
          ];
          const rawTabOrders = kitchenTab === 'pending' ? pendingOrders : kitchenTab === 'preparing' ? preparingOrders : readyOrders;
          const tabOrders = [...rawTabOrders].sort((a, b) => {
            const aStale = !a.kitchen_accepted_at && getOrderAgeMinutes(a.created_at) >= 15 && (a.order_items?.length ?? 0) > 0;
            const bStale = !b.kitchen_accepted_at && getOrderAgeMinutes(b.created_at) >= 15 && (b.order_items?.length ?? 0) > 0;
            if (aStale && !bStale) return -1;
            if (!aStale && bStale) return 1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          });
          const gridStyle: React.CSSProperties = {
            opacity:       isTableDragging ? 0.4 : 1,
            filter:        isTableDragging ? 'blur(4px)' : 'none',
            transition:    'opacity 0.2s, filter 0.2s',
            pointerEvents: isTableDragging ? 'none' : 'auto',
          };
          return (
            <div>
              {/* Kitchen sub-tabs */}
              <div className="relative flex gap-1 mb-5 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-1">
                {KITCHEN_TABS.map(tb => (
                  <button
                    key={tb.key}
                    onClick={() => setKitchenTab(tb.key)}
                    className={`relative flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                      kitchenTab === tb.key ? tb.text : tb.inactive
                    }`}
                  >
                    {kitchenTab === tb.key && (
                      <motion.div layoutId="kitchenActiveTab"
                        className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.12]"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className={`relative w-1.5 h-1.5 rounded-full ${tb.dot}`} />
                    <span className="relative">{tb.label}</span>
                    {tb.count > 0 && (
                      <span className="relative ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-white/60">
                        {tb.count}
                      </span>
                    )}
                    {kitchenTab === tb.key && (
                      <motion.div layoutId="kitchenTabLine"
                        className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div>
                {tabOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 select-none">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
                      <ClipboardList size={24} className="text-white/10" />
                    </div>
                    <p className="text-white/25 text-sm">
                      {kitchenTab === 'pending' ? t('kitchen_tab_no_pending') : kitchenTab === 'preparing' ? t('kitchen_tab_no_preparing') : t('kitchen_tab_no_ready')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5 border-t border-white/[0.06] md:border-0" style={gridStyle}>
                    <AnimatePresence mode="popLayout" initial={false}>
                      {tabOrders
                        .filter(order => !order.merged_into) // Birləşmiş (child) sifarişləri kart kimi göstərmə
                        .map(order => (
                        <motion.div
                          key={order.id}
                          layoutId={order.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={updatedLabels.has(order.id)
                            ? { opacity: 1, scale: [1, 1.03, 1], y: 0 }
                            : { opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.18 } }}
                          transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 1, layout: { type: 'spring', stiffness: 500, damping: 35 } }}
                        >
                          <div className="md:contents">
                            <ActiveOrderCard
                              order={order}
                              allOrders={orders}
                              updatedLabels={updatedLabels}
                              flashIds={flashIds}
                              confirmedIds={confirmedIds}
                              delayThreshold={delayThreshold}
                              onClick={() => setSelectedOrder(order)}
                            />
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          );
        })() : (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5">
            <AnimatePresence mode="popLayout">
              {filtered.map(order => (
                <ArchiveOrderCard key={order.id} order={order} allOrders={filtered} onClick={() => setSelectedOrder(order)} />
              ))}
            </AnimatePresence>
          </div>
        )}

      {/* Order Detail Modal — only for paid/archive orders */}
      <AnimatePresence>
        {selectedOrder && selectedOrder.status === 'paid' && (
          <OrderModal
            key={selectedOrder.id}
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onRefresh={fetchOrders}
            onConfirm={handleConfirm}
            onPay={async (order) => {
              setReceiptOrder(order);
              setSelectedOrder(null);
            }}
            onClearTable={handleClearTable}
            onDelete={handleDeleteOrder}
            allOrders={orders}
            onOrdersUpdate={(updater) => setOrders(prev => {
              const next = updater(prev);
              try { localStorage.setItem('saito_orders_cache', JSON.stringify(next)); } catch {}
              setSelectedOrder(sel => sel ? (next.find(o => o.id === sel.id) ?? sel) : null);
              return next;
            })}
          />
        )}
      </AnimatePresence>

      {/* Receipt Modal — page level so it survives OrderModal unmount */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          onClose={() => setReceiptOrder(null)}
          getProductName={(item) => {
            const p = item.products as any;
            return p?.name_az || p?.name_en || p?.name_ru || item.product_name;
          }}
          onPay={async () => {
            await handlePay(receiptOrder);
            setReceiptOrder(null);
          }}
        />
      )}

    </div>
  );
}
 