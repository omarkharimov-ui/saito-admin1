'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Users, Check, Clock, ShoppingBag, UserCheck, CalendarClock, CreditCard, Receipt } from 'lucide-react';
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

  const isOccupied = ['occupied', 'cooking', 'waiting_bill', 'waiting'].includes(table.status);
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
      bg: lightMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      iconColor: lightMode ? 'text-emerald-600' : 'text-emerald-400',
      dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
    },
    reserved: {
      icon: CalendarClock,
      label: t('reserved' as any),
      bg: lightMode ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
      iconColor: lightMode ? 'text-indigo-600' : 'text-indigo-400',
      dotColor: lightMode ? 'bg-indigo-500' : 'bg-indigo-400',
    },
    dirty: {
      icon: null,
      label: t('dirty' as any),
      bg: lightMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      iconColor: lightMode ? 'text-amber-600' : 'text-amber-400',
      dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
    },
    waiting: {
      icon: Clock,
      label: t('waiting' as any),
      bg: lightMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      iconColor: lightMode ? 'text-amber-600' : 'text-amber-400',
      dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
    },
    waiting_bill: {
      icon: Receipt,
      label: t('occupied' as any),
      bg: lightMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      iconColor: lightMode ? 'text-emerald-600' : 'text-emerald-400',
      dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
    },
    cooking: {
      icon: UserCheck,
      label: t('occupied' as any),
      bg: lightMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      iconColor: lightMode ? 'text-emerald-600' : 'text-emerald-400',
      dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
    },
    empty: {
      icon: null,
      label: t('empty' as any),
      bg: lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-400' : 'bg-white/5 border-white/5 text-white/30',
      iconColor: lightMode ? 'text-zinc-400' : 'text-white/30',
      dotColor: lightMode ? 'bg-zinc-300' : 'bg-white/20',
    },
  };

  const currentStatus = statusConfig[table.status as keyof typeof statusConfig] || statusConfig.empty;
  const StatusIcon = currentStatus.icon;

  const displayAmount = table.total_amount && table.total_amount > 0 ? table.total_amount : null;
  const displayGuests = table.guest_count && table.guest_count > 0 ? table.guest_count : null;
  const showContent = isReserved || isWaiting || isOccupied || displayAmount || displayGuests;

  return (
    <div>
      <div
        onClick={() => { playHapticSound('tap'); onTap(); }}
         className={`relative h-[180px] rounded-[24px] p-5 text-left transition-all duration-200 overflow-hidden border cursor-pointer group active:scale-[0.97]
          ${isTransferSource
            ? (lightMode ? 'bg-zinc-100 border-transparent opacity-60' : 'bg-zinc-800/50 border-transparent opacity-50')
            : isTransferTarget
              ? (lightMode ? 'bg-white border-zinc-400 border-dashed animate-pulse' : 'bg-zinc-900 border-zinc-400 border-dashed animate-pulse')
              : isSelected 
                ? (lightMode ? 'bg-white border-blue-500 shadow-lg' : 'bg-zinc-900 border-blue-500 shadow-lg') 
                : isDirty
                  ? (lightMode ? 'bg-amber-50 border-amber-300' : 'bg-amber-500/5 border-amber-500/30')
                  : isWaiting
                    ? (lightMode ? 'bg-amber-50/50 border-amber-300' : 'bg-amber-500/5 border-amber-500/30')
                    : isReserved
                    ? (lightMode ? 'bg-indigo-50/50 border-indigo-200' : 'bg-indigo-500/5 border-indigo-500/30')
                    : isOverdue 
                      ? (lightMode ? 'bg-white border-rose-500 shadow-sm' : 'bg-zinc-900 border-rose-500 shadow-md')
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
            {isGroup && (
              <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black leading-none uppercase tracking-tight ${
                lightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'
              }`}>
                {t('group_label')} {groupNumber}
              </span>
            )}
            {table.is_vip && (
              <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black leading-none uppercase tracking-tight ${lightMode ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                VIP
              </span>
            )}
            {table.has_pre_order && !isOccupied && (
              <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black leading-none uppercase tracking-tight ${lightMode ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'}`}>
                {t('pre_order' as any)}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {isTransferSource ? (
              <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                <span className="text-[8px] font-black text-rose-400">M</span>
              </div>
            ) : isTransferTarget ? (
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center animate-pulse">
                <span className="text-[8px] font-black text-emerald-400">H</span>
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
                <p className={`text-3xl font-black tracking-tight ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
                  ₼{displayAmount.toFixed(2)}
                </p>
              </div>
            )}

            {/* Guests + items row */}
            <div className="flex items-center gap-3 flex-wrap">
              {displayGuests && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                  <Users size={12} className={lightMode ? 'text-zinc-500' : 'text-zinc-400'} />
                  <span className={`text-[11px] font-black tabular-nums ${lightMode ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    {displayGuests}
                  </span>
                </div>
              )}
              {(table.item_count ?? 0) > 0 && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                  <ShoppingBag size={12} className={lightMode ? 'text-zinc-500' : 'text-zinc-400'} />
                  <span className={`text-[11px] font-black tabular-nums ${lightMode ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    {table.item_count}
                  </span>
                </div>
              )}
              {delaySec > 0 && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-black tabular-nums ${
                  delaySec > 1200 
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                    : delaySec > 600
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                      : lightMode 
                        ? 'bg-zinc-100 border-zinc-200 text-zinc-500' 
                        : 'bg-white/5 border-white/5 text-white/40'}`}>
                  <Clock size={10} strokeWidth={3} />
                  {formatDelay(delaySec)}
                </div>
              )}
            </div>

            {/* Reservation info for waiting/reserved */}
            {isWaiting && table.reservation_name && (
              <div className="mt-2">
                <span className={`text-sm font-bold truncate ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                  {table.reservation_name || table.reservation_phone || t('guest_pending')}
                </span>
              </div>
            )}
            {isReserved && table.reservation_name && (
              <div className="mt-2">
                <span className={`text-sm font-bold truncate ${lightMode ? 'text-indigo-950' : 'text-white'}`}>
                  {table.reservation_name || table.reservation_phone || table.table_number}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Group children numbers */}
        {isGroup && mergedChildNumbers && (
          <div className="absolute top-[68px] right-5 flex flex-col gap-1">
            {mergedChildNumbers.map((num: number) => (
              <span key={num} className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold border ${
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <AnimatePresence mode="sync">
              {!showOccupiedFlash && isOccupied && showKitchenStatus && kitchenStatus && kitchenStatus !== 'completed' && kitchenStatus !== 'cancelled' ? (
                <motion.div
                  key="kitchen"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                    kitchenStatus === 'preparing' || kitchenStatus === 'cooking'
                      ? lightMode ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-blue-500/15 border-blue-400/30 text-blue-400'
                      : kitchenStatus === 'ready'
                        ? lightMode ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-400'
                        : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/50'
                  }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    kitchenStatus === 'preparing' || kitchenStatus === 'cooking' ? (lightMode ? 'bg-blue-500 animate-pulse' : 'bg-blue-400 animate-pulse')
                      : kitchenStatus === 'ready' ? (lightMode ? 'bg-emerald-500' : 'bg-emerald-400')
                      : lightMode ? 'bg-zinc-400' : 'bg-white/40'
                  }`} />
                  {kitchenStatus === 'preparing' || kitchenStatus === 'cooking' ? t('kitchen_preparing' as any) : kitchenStatus === 'ready' ? t('kitchen_ready_badge' as any) : kitchenStatus === 'new' ? t('kitchen_new_badge' as any) : kitchenStatus === 'pending' ? t('kitchen_pending' as any) : kitchenStatus}
                </motion.div>
              ) : (
                <motion.div
                  key="status"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${currentStatus.bg}`}>
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
              <span className="shrink-0 relative px-2.5 py-1 rounded-lg text-[9px] font-black border-2 border-rose-500 bg-rose-500/20 text-rose-400 shadow-lg shadow-rose-500/30 flex items-center gap-1">
                <Receipt size={10} strokeWidth={2.5} />
                {t('bill_requested' as any)}
              </span>
            )}
            {table.has_pending && (
               <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  <Clock size={10} strokeWidth={2.5} />
                  {t('pending_status' as any)}
               </span>
            )}
            {table.waiter_name && (
              <span className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black border whitespace-nowrap ${lightMode ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-blue-500/10 border-blue-400/20 text-blue-400'}`}>
                {table.waiter_name}
              </span>
            )}
            {Number(table.order_count || 0) > 0 && (
              <span className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black border whitespace-nowrap ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                {table.order_count}
              </span>
            )}
            </div>
        </div>
      </div>
    </div>
  );
}
