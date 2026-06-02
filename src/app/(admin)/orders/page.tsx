'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList, WifiOff, AlertTriangle, X, BellRing, Maximize2, Minimize2,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNotifications } from '../context/NotificationContext';
import { useLayout } from '../context/LayoutContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useOrders } from './hooks/useOrders';
import { OrdersGhostLoading } from './components/OrdersGhostLoading';
import { CompactTableGrid } from './components/CompactTableGrid';
import { ActiveOrderCard } from './components/OrderCard';
import { OrderModal } from './components/OrderModal';
import { ReceiptModal } from './components/ReceiptModal';
import { ManualOrderModal } from './components/ManualOrderModal';
import type { Order } from './types';
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
  const [isTableDragging, setIsTableDragging] = useState(false);

  const [manualModalTable, setManualModalTable] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [cardFilter, setCardFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');

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
    if (o.is_served) return false;
    if (o.merged_into && (!o.order_items || o.order_items.length === 0)) return false;
    return true;
  }), [orders]);
  const newCount = useMemo(() => orders.filter(o => o.status === 'new').length, [orders]);

  const handleSelectTable = useCallback((tableNum: number) => {
    const order = activeOrders.find(o => o.table_number === tableNum);
    setSelectedOrder(order ?? null);
    setManualModalTable(order ? null : tableNum);
  }, [activeOrders]);

  const { setIsModalOpen } = useLayout();
  const isModalActive = manualModalTable !== null || (selectedOrder !== null && selectedOrder.status !== 'paid');
  useEffect(() => { setIsModalOpen(isModalActive); }, [isModalActive, setIsModalOpen]);

  const handleDismissReady = useCallback(async (orderId: string) => {
    const order = activeOrders.find(o => o.id === orderId);
    const mergedChildIds = order?.merged_orders?.map(child => child.id) || [];
    const allIdsToDismiss = [orderId, ...mergedChildIds];
    setDismissedReadyIds(prev => {
      const next = new Set(prev);
      allIdsToDismiss.forEach(id => next.add(id));
      try { localStorage.setItem('dismissedReadyIds', JSON.stringify([...next])); } catch {}
      return next;
    });
    await supabase.from('orders').update({ is_served: true }).in('id', allIdsToDismiss);
  }, [activeOrders]);

  const handleDismissAllReady = useCallback(async (ids: string[]) => {
    const allIdsToDismiss = new Set<string>();
    ids.forEach(id => {
      allIdsToDismiss.add(id);
      const order = activeOrders.find(o => o.id === id);
      const mergedChildIds = order?.merged_orders?.map(child => child.id) || [];
      mergedChildIds.forEach(childId => allIdsToDismiss.add(childId));
    });
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
    if (!o.order_items || o.order_items.length === 0) return false;
    return true;
  });

  const getStaleGroupNumber = (order: Order) => {
    if (!order.merged_orders || order.merged_orders.length === 0) return 0;
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
    const mergedGroups = staleOrders.filter(o => o.merged_orders && o.merged_orders.length > 0);
    const individualTables = staleOrders.filter(o => !o.merged_orders || o.merged_orders.length === 0);
    if (mergedGroups.length > 0 && individualTables.length === 0) {
      if (mergedGroups.length === 1) {
        return `${t('stale_group')} ${getStaleGroupNumber(mergedGroups[0])} — ${t('stale_not_accepted')}`;
      }
      return `${mergedGroups.length} ${t('stale_groups_not_accepted')}`;
    }
    if (individualTables.length > 0 && mergedGroups.length === 0) {
      return `${staleOrders.length} ${t('stale_orders_not_accepted')}`;
    }
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
      if (dismissedReadyIds.has(o.id) || o.is_served) return false;
      if (o.merged_orders && o.merged_orders.length > 0) {
        const hasDismissedChild = o.merged_orders.some(child =>
          dismissedReadyIds.has(child.id)
        );
        if (hasDismissedChild) return false;
      }
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

  const filtered = useMemo(() => {
    let result = orders
      .filter(o => {
        if (o.status === 'paid') return false;
        if (o.merged_into !== null && o.merged_into !== undefined) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (cardFilter === 'pending') {
      result = result.filter(o => o.status === 'new' || (o.status === 'confirmed' && !o.kitchen_accepted_at));
    } else if (cardFilter === 'preparing') {
      result = result.filter(o => o.kitchen_status === 'cooking' || o.kitchen_status === 'preparing');
    } else if (cardFilter === 'ready') {
      result = result.filter(o => o.kitchen_status === 'ready');
    }

    return result;
  }, [orders, cardFilter]);

  const isCardsView = !manualModalTable && !(selectedOrder && selectedOrder.status !== 'paid');

  return (
    <div className="h-screen overflow-hidden flex flex-col">

      {/* Stale orders banner */}
      <AnimatePresence>
        {staleOrders.length > 0 && !staleDismissed && (
          <motion.div
            key={staleKey}
            drag="x" dragConstraints={{ left: 0, right: 400 }} dragElastic={0.1}
            onDragEnd={(_e, info) => { if (info.offset.x > 60 || info.velocity.x > 300) setStaleDismissed(true); }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 400 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm cursor-grab active:cursor-grabbing select-none"
          >
            <AlertTriangle size={15} className="flex-shrink-0 animate-pulse" />
            <span className="font-semibold flex-1">{getStaleOrdersText()}</span>
            <button onClick={() => setStaleDismissed(true)}
              className="ml-2 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
            <WifiOff size={15} className="flex-shrink-0" />
            <span>{t('offline_message')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-2 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-serif font-bold text-white leading-tight">{t('orders')}</h1>
          {newCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-gold/70 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleFullscreen}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/50 hover:text-white/80 transition-all">
            {fullscreen ? <Minimize2 size={15} strokeWidth={1.5} /> : <Maximize2 size={15} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Compact Table Grid */}
      <div className="px-2 flex-shrink-0">
        <CompactTableGrid
          orders={activeOrders}
          allOrders={orders}
          tableCount={tableCount}
          onTableClick={(order) => handleSelectTable(order.table_number!)}
          onEmptyTableClick={handleSelectTable}
          onMergeTables={handleMergeOrders}
          onMoveTable={handleMoveOrder}
          onAddEmptyTable={handleAddEmptyTable}
          onEmptyMerge={handleCreateMergedEmptyOrder}
          onDragStateChange={setIsTableDragging}
          t={t}
        />
      </div>

      {/* Order cards or order detail */}
      {manualModalTable ? (
        <div className="flex-1 overflow-hidden px-2 pb-4 mt-3">
          <ManualOrderModal
            key={manualModalTable}
            tableNum={manualModalTable}
            onClose={() => { setManualModalTable(null); setSelectedOrder(null); }}
            onCreated={() => { setManualModalTable(null); setSelectedOrder(null); fetchOrders(); }}
          />
        </div>
      ) : selectedOrder && selectedOrder.status !== 'paid' ? (
        <div className="flex-1 overflow-hidden px-2 pb-4 mt-3">
          <OrderModal
            key={selectedOrder.id}
            order={selectedOrder}
            inline
            onClose={() => { setSelectedOrder(null); setManualModalTable(null); }}
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
        <div className="flex-1 px-2 pb-4 mt-3">
          <OrdersGhostLoading />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-2 pb-4 mt-3">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center select-none">
            <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
              <ClipboardList size={28} className="text-white/10" />
            </div>
            <p className="text-white/30 text-sm font-medium">{t('no_active_orders')}</p>
            <p className="text-white/15 text-xs mt-1">{t('new_orders_will_appear')}</p>
          </motion.div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 px-2 pb-4 mt-3">
          {/* Filter pills */}
          {isCardsView && (
            <div className="flex items-center gap-1.5 mb-3 flex-shrink-0">
              {([
                { key: 'all' as const, label: t('kitchen_tab_all') },
                { key: 'pending' as const, label: t('kitchen_tab_pending') },
                { key: 'preparing' as const, label: t('kitchen_tab_preparing') },
                { key: 'ready' as const, label: t('kitchen_tab_ready') },
              ]).map(pill => (
                <button
                  key={pill.key}
                  onClick={() => setCardFilter(pill.key)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150
                    ${cardFilter === pill.key
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'text-white/40 hover:text-white/70 border border-transparent hover:border-white/10'
                    }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          )}

          {/* Cards grid */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3"
              style={{
                opacity: isTableDragging ? 0.3 : 1,
                filter: isTableDragging ? 'blur(4px)' : 'none',
                transition: 'opacity 0.2s, filter 0.2s',
                pointerEvents: isTableDragging ? 'none' : 'auto',
              }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered
                  .filter(order => !order.merged_into)
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
                    <ActiveOrderCard
                      order={order}
                      allOrders={orders}
                      updatedLabels={updatedLabels}
                      flashIds={flashIds}
                      confirmedIds={confirmedIds}
                      delayThreshold={delayThreshold}
                      onClick={() => setSelectedOrder(order)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Ready notifications — portal */}
      {createPortal(
        <div className="fixed top-5 right-5 z-[9999] flex flex-col items-end gap-3 pointer-events-none" style={{ maxWidth: 360 }}>
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
                <div className="absolute inset-0 -inset-3 bg-black/20 backdrop-blur-sm rounded-2xl pointer-events-none z-[-1]" />
                <div className="relative flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-black/70 backdrop-blur-md border border-gold/20 text-gold text-sm shadow-[0_8px_32px_rgba(212,175,55,0.15),0_4px_12px_rgba(0,0,0,0.4)] cursor-grab active:cursor-grabbing select-none overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-gold/60 via-gold to-gold/60 rounded-l-2xl" />
                  <div className="flex-shrink-0 relative">
                    <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center">
                      <BellRing size={16} className="text-gold animate-pulse" />
                    </div>
                    <div className="absolute inset-0 rounded-xl border border-gold/20 animate-ping opacity-30" />
                  </div>
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

      {/* Order detail modal for paid orders */}
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

      {/* Receipt Modal */}
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
