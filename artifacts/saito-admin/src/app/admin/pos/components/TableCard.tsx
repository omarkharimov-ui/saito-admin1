'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Users, Check, Clock, ShoppingBag, UserCheck, CalendarClock, CreditCard, Receipt, CheckCircle2, Utensils } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosTable } from '../types/shared';
import { playHapticSound } from '@/lib/haptic';

interface TableCardProps {
  table: PosTable;
  onTap: () => void;
  onAction: () => void;
  isSelected?: boolean;
  selectionMode?: boolean;
  isTransferSource?: boolean;
  isTransferTarget?: boolean;
  isOverdue?: boolean;
  overdueType?: 'not_accepted' | 'preparing';
  index?: number;
  groupNumber?: number;
  mergedChildNumbers?: number[];
  isMergedChild?: boolean;
  kitchenStatus?: string | null;
  flashNonce?: number;
}

export function TableCard({ table, onTap, onAction, isSelected, selectionMode, isTransferSource, isTransferTarget, isOverdue, overdueType, index = 0, groupNumber, mergedChildNumbers, isMergedChild, kitchenStatus, flashNonce }: TableCardProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [delaySec, setDelaySec] = useState(0);
  const [showKitchenStatus, setShowKitchenStatus] = useState(false);
  const [statusTransition, setStatusTransition] = useState<string | null>(null);

  const isOccupied = ['ordering', 'occupied', 'cooking', 'waiting_bill', 'waiting', 'ordered', 'confirmed', 'in_kitchen', 'served', 'dining', 'bill_requested', 'payment_pending', 'paid', 'cleaning'].includes(table.status);
  const isServed = table.status === 'served';
  const isDirty = table.status === 'dirty';
  const isReserved = table.status === 'reserved';
  const isWaiting = table.status === 'waiting';
  const isGroup = groupNumber && mergedChildNumbers && mergedChildNumbers.length > 0 && !isMergedChild;
  const wasOccupiedRef = useRef(isOccupied);
  const prevStatusRef = useRef(table.status);

  useEffect(() => {
    if (!isOccupied || !table.last_activity_at) {
      setDelaySec(0);
      return;
    }

    const startTime = new Date(table.last_activity_at).getTime();
    
    const update = () => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      setDelaySec(diff > 0 ? diff : 0);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [isOccupied, table.last_activity_at]);

  useEffect(() => {
    const justBecameOccupied = isOccupied && !wasOccupiedRef.current;
    wasOccupiedRef.current = isOccupied;

    if (!isOccupied || !kitchenStatus || kitchenStatus === 'completed' || kitchenStatus === 'cancelled') {
      setShowKitchenStatus(false);
      return;
    }

    if (justBecameOccupied) {
      setShowKitchenStatus(false);
      const t = setTimeout(() => {
        setShowKitchenStatus(true);
      }, 2000);
      return () => clearTimeout(t);
    }

    setShowKitchenStatus(true);
  }, [kitchenStatus, isOccupied]);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = table.status;
    prevStatusRef.current = currentStatus;

    if (prevStatus !== currentStatus && prevStatus === 'occupied' && !isOccupied) {
      setStatusTransition('occupied');
      const t = setTimeout(() => {
        setStatusTransition(null);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [table.status, isOccupied]);

  useEffect(() => {
    if (!flashNonce) return;
    setStatusTransition('occupied');
    const t = setTimeout(() => {
      setStatusTransition(null);
    }, 2000);
    return () => clearTimeout(t);
  }, [flashNonce]);

  const showOccupiedFlash = statusTransition === 'occupied';

  const formatDelay = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const statusConfig = {
    occupied: {
      icon: UserCheck,
      label: t('occupied' as any),
      bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
      iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
      dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
    },
    reserved: {
      icon: CalendarClock,
      label: t('reserved' as any),
      bg: lightMode ? 'bg-indigo-100 border-indigo-400 text-indigo-800' : 'bg-indigo-500/25 border-indigo-400/60 text-indigo-300',
      iconColor: lightMode ? 'text-indigo-700' : 'text-indigo-400',
      dotColor: lightMode ? 'bg-indigo-500' : 'bg-indigo-400',
    },
    dirty: {
      icon: null,
      label: t('dirty' as any),
      bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300',
      iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
      dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
    },
    waiting: {
      icon: Clock,
      label: t('waiting' as any),
      bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300',
      iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
      dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
    },
    waiting_bill: {
      icon: Receipt,
      label: t('occupied' as any),
      bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
      iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
      dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
    },
    cooking: {
      icon: UserCheck,
      label: t('occupied' as any),
      bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
      iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
      dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
    },
     ordered: {
       icon: ShoppingBag,
       label: t('table_ordered' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
     confirmed: {
       icon: CheckCircle2,
       label: t('table_confirmed' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
     in_kitchen: {
       icon: Utensils,
       label: t('table_in_kitchen' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
     ready: {
       icon: CheckCircle2,
       label: t('table_ready' as any),
       bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300',
       iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
       dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
     },
     served: {
       icon: CheckCircle2,
       label: t('order_served' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
     ordering: {
       icon: Utensils,
       label: t('table_ordered' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
     dining: {
       icon: CheckCircle2,
       label: t('order_served' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
     bill_requested: {
       icon: Receipt,
       label: t('bill_requested' as any),
       bg: lightMode ? 'bg-rose-100 border-rose-400 text-rose-800' : 'bg-rose-500/25 border-rose-400/60 text-rose-300',
       iconColor: lightMode ? 'text-rose-700' : 'text-rose-400',
       dotColor: lightMode ? 'bg-rose-500' : 'bg-rose-400',
     },
     payment_pending: {
       icon: CreditCard,
       label: t('payment_pending' as any),
       bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300',
       iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
       dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
     },
     paid: {
       icon: CheckCircle2,
       label: t('paid' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
     cleaning: {
       icon: null,
       label: t('needs_cleaning' as any),
       bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300',
       iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
       dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
     },
     empty: {
      icon: null,
      label: t('empty' as any),
      bg: lightMode ? 'bg-zinc-100 border-zinc-300 text-zinc-500' : 'bg-white/10 border-white/20 text-zinc-400',
      iconColor: lightMode ? 'text-zinc-500' : 'text-zinc-400',
      dotColor: lightMode ? 'bg-zinc-400' : 'bg-white/30',
    },
  };

  const currentStatus = statusConfig[table.status as keyof typeof statusConfig] || statusConfig.empty;
  const StatusIcon = currentStatus.icon;

  const displayAmount = table.total_amount && table.total_amount > 0 ? table.total_amount : null;
  const displayGuests = table.guest_count && table.guest_count > 0 ? table.guest_count : null;
  const showContent = isReserved || isWaiting || isOccupied || displayAmount || displayGuests;

  return (
         <div
         onClick={() => { onTap(); }}
          className={`relative h-[180px] rounded-4xl p-5 text-left transition-all duration-200 overflow-hidden border cursor-pointer group active:scale-[0.97] shadow-card
           ${isTransferSource
             ? (lightMode ? 'bg-zinc-100 border-transparent opacity-60' : 'bg-zinc-800/50 border-transparent opacity-50')
             : isTransferTarget
               ? (lightMode ? 'bg-white border-zinc-400 border-dashed animate-pulse' : 'bg-zinc-900 border-zinc-400 border-dashed animate-pulse')
               : isSelected 
                 ? (lightMode ? 'bg-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-zinc-900 border-blue-500 shadow-lg shadow-blue-500/20') 
                 : isDirty
                   ? (lightMode ? 'bg-amber-50 border-amber-300' : 'bg-amber-500/5 border-amber-500/30')
                   : isWaiting
                     ? (lightMode ? 'bg-amber-50/50 border-amber-300' : 'bg-amber-500/5 border-amber-500/30')
                     : isReserved
                     ? (lightMode ? 'bg-indigo-50/50 border-indigo-200' : 'bg-indigo-500/5 border-indigo-500/30')
                     : isOverdue 
                       ? (lightMode ? 'bg-white border-rose-500 shadow-sm' : 'bg-zinc-900 border-rose-500 shadow-md')
                       : table.status === 'ready'
                         ? (lightMode ? 'bg-white border-amber-400 shadow-sm' : 'bg-zinc-900 border-amber-500/60 shadow-sm')
                       : isOccupied
                         ? (lightMode ? 'bg-white border-emerald-500 shadow-sm' : 'bg-zinc-900 border-emerald-500/60 shadow-sm')
                         : (lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900 border-white/10 shadow-sm')
           } ${
             isGroup ? (lightMode ? 'border-l-[3px] border-l-blue-500 bg-blue-50/30' : 'border-l-[3px] border-l-blue-500 bg-blue-500/[0.03]') : ''
           }`}
          style={isGroup ? { borderLeftWidth: '3px', borderLeftColor: '#007AFF' } : {}}
        >
        {/* Top row: Table number + action */}
        <div className="absolute top-4 left-5 right-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-black tracking-tighter ${isSelected ? (lightMode ? 'text-zinc-900' : 'text-white') : isDirty ? (lightMode ? 'text-amber-700' : 'text-amber-400') : isWaiting ? (lightMode ? 'text-amber-700' : 'text-amber-400') : isReserved ? (lightMode ? 'text-indigo-600' : 'text-indigo-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
              {t('table' as any)} {table.table_number}
            </span>
            {table.pre_order && (
              <span className={`px-1.5 py-0.5 rounded-md text-xs font-black leading-none uppercase tracking-tight ${
                lightMode ? 'bg-slate-100 text-slate-600 border border-slate-300' : 'bg-white/10 text-white/70 border border-white/20'
              }`}>
                Pre-order
              </span>
            )}
            {isGroup && groupNumber && (
              <span className={`px-1.5 py-0.5 rounded-md text-xs font-black leading-none uppercase tracking-tight ${
                lightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'
              }`}>
                {t('group_label')} {groupNumber}
              </span>
            )}
          </div>
           <div className="flex items-center gap-1">
             {isTransferSource ? (
               <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                 <span className="text-xs font-black text-rose-400">M</span>
               </div>
             ) : isTransferTarget ? (
               <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center animate-pulse">
                 <span className="text-xs font-black text-emerald-400">H</span>
               </div>
             ) : selectionMode ? (
               <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                 isSelected ? 'bg-blue-500 border-blue-500' : (lightMode ? 'bg-zinc-100 border-zinc-300' : 'bg-white/5 border-white/10')
               }`}>
                 <AnimatePresence>{isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={14} className="text-white" strokeWidth={3} /></motion.div>}</AnimatePresence>
               </div>
             ) : (
               <motion.button
                 whileTap={{ scale: 0.9 }}
                 transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.4 }}
                 onClick={(e) => { e.stopPropagation(); onAction(); }}
                 className="p-1.5 rounded-full transition-colors opacity-60 hover:opacity-100"
               >
                 <MoreVertical size={16} className={`${lightMode ? 'text-zinc-400' : 'text-white/60'}`} />
               </motion.button>
             )}
           </div>
         </div>

        {/* Main content: Amount hero + guests */}
        {showContent && (
          <div className="absolute top-[52px] left-5 right-5">
              {/* Amount as hero element */}
              {displayAmount && (
                <div className="mb-2">
                  <p className="text-[32px] font-black tracking-tight text-white">
                    ₼{displayAmount.toFixed(2)}
                  </p>
                </div>
              )}
             
             {/* Reservation name first */}
             {isWaiting && table.reservation_name && (
               <div className="mb-2">
                 <span className={`text-sm font-bold truncate ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                   {table.reservation_name || table.reservation_phone || t('guest_pending')}
                 </span>
               </div>
             )}
             {isReserved && table.reservation_name && (
               <div className="mb-2">
                 <span className={`text-sm font-bold truncate ${lightMode ? 'text-indigo-950' : 'text-white'}`}>
                   {table.reservation_name || table.reservation_phone || table.table_number}
                 </span>
               </div>
             )}
             {isReserved && !table.reservation_name && (
               <div className="mb-2">
                 <span className={`text-sm font-bold truncate ${lightMode ? 'text-indigo-600' : 'text-indigo-300'}`}>
                   {t('reserved' as any)} · {table.guest_count || '?'} {t('person' as any)}
                 </span>
               </div>
             )}

             {/* Compact info labels */}
             <div className="flex items-center gap-2 flex-wrap">
               {displayGuests && (
                 <span className={`inline-flex items-center gap-1 text-xs font-black uppercase tracking-tight ${lightMode ? 'text-zinc-600' : 'text-zinc-300'}`}>
                   <Users size={13} />
                   {displayGuests}
                 </span>
               )}
               {(table.item_count ?? 0) > 0 && (
                 <span className={`inline-flex items-center gap-1 text-xs font-black uppercase tracking-tight ${lightMode ? 'text-zinc-600' : 'text-zinc-300'}`}>
                   <ShoppingBag size={13} />
                   {table.item_count}
                 </span>
               )}
             </div>

              {table.pre_order && (
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-slate-100 text-slate-600 border border-slate-300' : 'bg-white/10 text-white/70 border border-white/20'}`}>
                    <ShoppingBag size={10} /> Pre-order
                  </span>
                </div>
              )}
           </div>
         )}

        {/* Group children numbers */}
        {isGroup && mergedChildNumbers && (
          <div className="absolute top-[68px] right-5 flex flex-col gap-1">
            {mergedChildNumbers.map((num: number) => (
              <span key={num} className={`px-1.5 py-0.5 rounded-md text-xs font-bold border ${
                lightMode 
                  ? 'bg-blue-50 border-blue-200 text-blue-700' 
                  : 'bg-white/5 border-white/10 text-white/60'
              }`}>
                {num}
              </span>
            ))}
          </div>
        )}

        {/* Bottom row: Status badges + order count */}
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
              <AnimatePresence mode="wait">
               {!showOccupiedFlash && isOccupied && showKitchenStatus && kitchenStatus && kitchenStatus !== 'completed' && kitchenStatus !== 'cancelled' && kitchenStatus !== 'ready' && table.status !== 'served' && table.status !== 'dining' ? (
                 <motion.div
                   key="kitchen"
                   initial={{ opacity: 0, y: 4 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -4 }}
                   transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest ${
                      kitchenStatus === 'preparing' || kitchenStatus === 'cooking'
                        ? lightMode ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-blue-500/25 border-blue-400/50 text-blue-300'
                        : kitchenStatus === 'ready'
                          ? lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
                          : lightMode ? 'bg-zinc-100 border-zinc-300 text-zinc-600' : 'bg-white/10 border-white/20 text-zinc-300'
                    }`}>
                   <div className={`w-1.5 h-1.5 rounded-full ${
                     kitchenStatus === 'preparing' || kitchenStatus === 'cooking' ? (lightMode ? 'bg-blue-500 animate-pulse' : 'bg-blue-400 animate-pulse')
                       : kitchenStatus === 'ready' ? (lightMode ? 'bg-emerald-500' : 'bg-emerald-400')
                       : lightMode ? 'bg-zinc-400' : 'bg-white/40'
                   }`} />
                   {kitchenStatus === 'preparing' || kitchenStatus === 'cooking' ? t('kitchen_preparing' as any) : kitchenStatus === 'ready' ? t('table_ready' as any) : kitchenStatus === 'new' ? t('kitchen_new_badge' as any) : kitchenStatus === 'pending' ? t('kitchen_pending' as any) : kitchenStatus}
                 </motion.div>
               ) : (
                 <motion.div
                   key="status"
                   initial={{ opacity: 0, y: 4 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -4 }}
                   transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                   className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest ${currentStatus.bg}`}>
                   {StatusIcon && <StatusIcon size={10} strokeWidth={2.5} className={currentStatus.iconColor} />}
                 {showOccupiedFlash ? t('occupied' as any) : currentStatus.label}
                   {table.status === 'dirty' && (
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                       <path d="M12 3v15" />
                       <path d="M5 20h14v4H5z" />
                       <path d="M9 16c1-2 3-2 6 0" />
                     </svg>
                   )}
                 </motion.div>
               )}
             </AnimatePresence>
              {table.bill_requested && (
                <span className="shrink-0 relative px-2.5 py-1 rounded-lg text-xs font-black border-2 border-rose-500 bg-rose-500/20 text-rose-400 shadow-lg shadow-rose-500/30 flex items-center gap-1">
                  <Receipt size={10} strokeWidth={2.5} />
                  {t('bill_requested' as any)}
                </span>
              )}
              {table.has_pending && (
                <span className={`shrink-0 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest flex items-center gap-1 ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                   <Clock size={10} strokeWidth={2.5} />
                   {t('pending_status' as any)}
                </span>
             )}
             {table.waiter_name && (
               <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-black border whitespace-nowrap ${lightMode ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-blue-500/10 border-blue-400/20 text-blue-400'}`}>
                 {table.waiter_name}
               </span>
             )}
              {Number(table.order_count || 0) > 0 && (
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-black border whitespace-nowrap ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  {table.order_count}
                </span>
              )}
             </div>
         </div>
       </div>
   );
}
