'use client';

import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { MoreVertical, Users, Check, Clock, ShoppingBag, UserCheck, CalendarClock, CreditCard, Receipt, CheckCircle2, Utensils, X } from '@/components/ui/saito-icons';
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosTable } from '../types/shared';
import { playHapticSound } from '@/lib/haptic';
import { T, EASE, SPRING, tableStateOf, tableTransition, type TableState } from '@/lib/motion/system';
import { Morph } from '@/lib/motion/Morph';

interface TableCardProps {
  table: PosTable;
  onTap: () => void;
  onAction: () => void;
  /** 2026-09-23 (owner): HESAB chip was open-only; now tappable to close. */
  onToggleBill?: () => void;
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
  /** G8 floor batch: 150ms pre-navigation selection pulse (table tap → order). */
  tapPulseNonce?: number;
}

export function TableCard({ table, onTap, onAction, onToggleBill, isSelected, selectionMode, isTransferSource, isTransferTarget, isOverdue, overdueType, index = 0, groupNumber, mergedChildNumbers, isMergedChild, kitchenStatus, flashNonce, tapPulseNonce }: TableCardProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [delaySec, setDelaySec] = useState(0);
  const [showKitchenStatus, setShowKitchenStatus] = useState(false);
  const [statusTransition, setStatusTransition] = useState<string | null>(null);
  // 1s understated ring for an actual FREE → OCCUPIED transition only.
  const [seatRingNonce, setSeatRingNonce] = useState(0);
  // ~0.4s selection ring for table tap → order navigation.
  const [openRingNonce, setOpenRingNonce] = useState(0);

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

    if (prevStatus !== currentStatus) {
      // OCCUPIED → free: keep the existing label flash.
      if (prevStatus === 'occupied' && !isOccupied) {
        setStatusTransition('occupied');
        const t = setTimeout(() => {
          setStatusTransition(null);
        }, 3000);
        return () => clearTimeout(t);
      }
      // FREE → OCCUPIED family: real status transition only (never on
      // rerender/poll/realtime echo of an unchanged status).
      if (prevStatus === 'empty' && isOccupied) {
        setSeatRingNonce(Date.now());
      }
    }
  }, [table.status, isOccupied]);

  // Selection pulse (table tap → order). Timed to the ~150ms navigation delay.
  useEffect(() => {
    if (!tapPulseNonce) return;
    setOpenRingNonce(Date.now());
  }, [tapPulseNonce]);

  useEffect(() => {
    if (!seatRingNonce) return;
    const t = setTimeout(() => setSeatRingNonce(0), 1100);
    return () => clearTimeout(t);
  }, [seatRingNonce]);

  // 2026-09-27 (owner: "masa acilanda 1.5 saniyelik gorsensin user anlamaq
  // ucin"): the open-ring now holds 1.5s with a soft glow so the operator
  // clearly sees WHICH table the cart panel belongs to.
  useEffect(() => {
    if (!openRingNonce) return;
    const t = setTimeout(() => setOpenRingNonce(0), 1500);
    return () => clearTimeout(t);
  }, [openRingNonce]);

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

  // Archived table: immutable (DB trigger blocks ordering). Rendered as a
  // calm dashed placeholder — still visible on the floor map (staff context),
  // but clearly non-operational. Tap/action are guarded in the page (toast).
  const isArchived = !!(table as any).is_archived;
  if (isArchived) {
    return (
      <div
        data-archived-table
        onClick={onTap}
        aria-disabled="true"
        className={`relative h-[180px] rounded-4xl p-5 text-left overflow-hidden border border-dashed shadow-card cursor-not-allowed select-none
          ${lightMode ? 'bg-zinc-50/60 border-zinc-300' : 'bg-zinc-900/30 border-white/10'}`}
      >
        <div className="absolute top-4 left-5 right-4 flex items-start justify-between gap-2">
          <span className={`text-2xl font-black tracking-tighter ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>
            {t('table' as any)} {table.table_number}
          </span>
          <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none uppercase tracking-wide border ${
            lightMode ? 'bg-zinc-100 text-zinc-500 border-zinc-300' : 'bg-white/5 text-white/50 border-white/15'
          }`}>
            {(t as any)('archived_table') || 'Arxiv'}
          </span>
        </div>
        <div className={`absolute bottom-4 left-5 text-[11px] font-semibold uppercase tracking-wide ${lightMode ? 'text-zinc-400' : 'text-white/25'}`}>
          {(t as any)('archived_table_info') || 'Arxivlənib — sifariş mümkün deyil'}
        </div>
      </div>
    );
  }

  const currentStatus = statusConfig[table.status as keyof typeof statusConfig] || statusConfig.empty;
  const StatusIcon = currentStatus.icon;
  const seatedNoOrder = table.status === 'occupied' && !table.current_order_id;

  const displayAmount = table.total_amount && table.total_amount > 0 ? table.total_amount : null;
  const displayGuests = table.guest_count && table.guest_count > 0 ? table.guest_count : null;
  const showContent = isReserved || isWaiting || isOccupied || displayAmount || displayGuests;

  // ── Saito Motion System (2026-09-27): card SETTLE on STATE change ──
  // The card never "dies and re-renders". When its lifecycle state changes
  // (EMPTY→NEW_SESSION, →PAID, →CLEANING...), the tableTransition map picks
  // the choreography; cardSettle types get a 0.99→1 breath. The operator
  // feels "something happened here" without watching an animation.
  const currentState = tableStateOf(table.status, !!table.current_order_id, isDirty);
  const prevStateRef = useRef<TableState | null>(null);
  const cardControls = useAnimationControls();
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = currentState;
    if (prev === null || prev === currentState) return;
    const tr = tableTransition(prev, currentState);
    if (tr.cardSettle) {
      void cardControls.start({
        scale: [tr.cardSettle.from, 1],
        transition: { duration: T.emphasis, ease: EASE.enter },
      });
    }
  }, [currentState, cardControls]);

  // 2026-09-25 (owner: "dine-in kartlarini duzelde, biraz daha seliqeli
  // forma"): TableCard joins the board-card family — ONE calm surface
  // (#141419 dark / white light) with a STATUS ACCENT BORDER instead of
  // colored card fills; flex-flow layout (no absolute stacking). All data
  // and interactions (rings, merge/transfer, selection, chips) are kept.
  const stateBorder = isOverdue
    ? (lightMode ? 'border-rose-500' : 'border-rose-500/70')
    : table.bill_requested
      ? (lightMode ? 'border-rose-400' : 'border-rose-500/50')
      : table.status === 'ready'
        ? (lightMode ? 'border-amber-400' : 'border-amber-500/60')
        : isReserved
          ? (lightMode ? 'border-indigo-300' : 'border-indigo-500/40')
          : isDirty || isWaiting
            ? (lightMode ? 'border-amber-300' : 'border-amber-500/40')
            : isOccupied
              ? (lightMode ? 'border-emerald-400/70' : 'border-emerald-500/45')
              : (lightMode ? 'border-zinc-200' : 'border-white/10');

  return (
         <motion.div
         onClick={() => { onTap(); }}
         animate={cardControls}
         whileTap={{ scale: 0.97 }}
         transition={SPRING.press}
         className={`relative h-[180px] rounded-4xl p-5 text-left overflow-hidden border cursor-pointer group flex flex-col
          /* Motion System: transition EXCLUDES transform (framer owns it); border
             color still crossfades in T.standard (200ms) — the border "yaranır". */
          [transition:border-color_0.2s_cubic-bezier(0.4,0,0.2,1),background-color_0.2s_cubic-bezier(0.4,0,0.2,1),box-shadow_0.2s_cubic-bezier(0.4,0,0.2,1),opacity_0.14s_ease-out]
          ${isTransferSource
            ? (lightMode ? 'bg-zinc-100 border-transparent opacity-60' : 'bg-[#141419] border-transparent opacity-50')
            : isTransferTarget
              ? (lightMode ? 'bg-white border-zinc-400 border-dashed animate-pulse' : 'bg-[#141419] border-zinc-400 border-dashed animate-pulse')
              : isSelected
                ? (lightMode ? 'bg-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-[#141419] border-blue-500 shadow-lg shadow-blue-500/20')
                : (lightMode ? 'bg-white shadow-sm' : 'bg-[#141419]')
          } ${
            (isTransferSource || isTransferTarget || isSelected) ? '' : stateBorder
          } ${
            isGroup ? 'border-l-[3px] border-l-blue-500' : ''
          }`}
         style={isGroup ? { borderLeftWidth: '3px', borderLeftColor: '#007AFF' } : {}}
        >
        {/* Transition ring — seat (FREE→OCCUPIED, ~1s) or tap-open selection (~0.4s).
            Overlay-only, pointer-events-none; the card itself stays calm at rest. */}
        {(seatRingNonce > 0 || openRingNonce > 0) && (
          <motion.div
            key={`pulse-${seatRingNonce || openRingNonce}`}
            className={`absolute inset-0 rounded-4xl border-2 pointer-events-none z-10 ${
              openRingNonce > 0
                ? (lightMode ? 'border-blue-500/90 shadow-[0_0_24px_rgba(59,130,246,0.35)]' : 'border-blue-400/90 shadow-[0_0_24px_rgba(59,130,246,0.35)]')
                : 'border-emerald-400/80'
            }`}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.985, 1.004, 1.004, 1.006] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: openRingNonce > 0 ? 1.5 : 1,
              ease: 'easeOut',
              times: [0, 0.12, 0.75, 1],
            }}
          />
        )}

        {/* Motion System (2026-09-27, owner "OVERLAY NEVER"): no label overlay
            on operations. The card IS the feedback — border crossfades, labels
            morph, content fades, card settles. The state change speaks. */}

         {/* Top row: Table number + action (flex-flow, was absolute).
             2026-09-27 (E2E: "kartlar bir-birinə girib"): the title never
             wraps onto two lines next to the QRUP/pre-order badges — nowrap +
             truncate keeps the row at a single height on every viewport. */}
         <div className="flex items-start justify-between gap-2 min-w-0">
           <div className="flex items-center gap-1.5 min-w-0">
              {/* E2E: truncate chopped "Masa 17" → "M..." next to the QRUP chip.
                  Instead: full title on ONE line, step the size down when a
                  badge shares the row. */}
              <span className={`${(isGroup && groupNumber) || table.pre_order ? 'text-xl' : 'text-2xl'} font-black tracking-tighter whitespace-nowrap ${isSelected ? (lightMode ? 'text-zinc-900' : 'text-white') : isDirty ? (lightMode ? 'text-amber-700' : 'text-amber-400') : isWaiting ? (lightMode ? 'text-amber-700' : 'text-amber-400') : isReserved ? (lightMode ? 'text-indigo-600' : 'text-indigo-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
                {t('table' as any)} {table.table_number}
              </span>
             {table.pre_order && (
               <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-xs font-black leading-none uppercase tracking-tight ${
                 lightMode ? 'bg-slate-100 text-slate-600 border border-slate-300' : 'bg-white/10 text-white/70 border border-white/20'
               }`}>
                 Pre-order
               </span>
             )}
             {isGroup && groupNumber && (
               <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-xs font-black leading-none uppercase tracking-tight ${
                 lightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'
               }`}>
                 {t('group_label')} {groupNumber}
               </span>
             )}
           </div>
            <div className="flex items-center gap-1">
              {/* 2026-09-23 (owner): guest + item counts live in the TOP row
                  (the empty space above the status chip) — "heç bir zaman"
                  bottom-right. Amount hero stays in the middle. */}
              {displayGuests && (
                <span className={`inline-flex items-center gap-1 text-[13px] font-black tabular-nums shrink-0 ${lightMode ? 'text-zinc-700' : 'text-white/85'}`}>
                  <Users size={15} strokeWidth={2.5} />
                  {/* Motion System: guest count morphs in place (icon stays, number swaps) */}
                  <Morph value={displayGuests} y={3} duration={T.quick}>{displayGuests}</Morph>
                </span>
              )}
              {(table.item_count ?? 0) > 0 && (
                <span className={`inline-flex items-center gap-1 text-[13px] font-black tabular-nums shrink-0 ${lightMode ? 'text-zinc-700' : 'text-white/85'}`}>
                  <ShoppingBag size={15} strokeWidth={2.5} />
                  {table.item_count}
                </span>
              )}
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

         {/* Main content: Amount hero + guests (flex-flow, was absolute).
             Motion System — dismiss/clear choreography (owner: "reqemler,
             border aniden yox olmasin, yavas fade out"): content drifts up +
             blurs out over T.standard while the border crossfades in the
             SAME 200ms window. On reveal (table opens) it settles in. */}
         <AnimatePresence initial={false}>
         {showContent && (
           <motion.div
             key="table-content"
             initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
             animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
             exit={{ opacity: 0, y: -8, scale: 0.985, filter: 'blur(4px)', transition: { duration: T.grace, ease: EASE.graceful } }}
             transition={{ duration: T.standard, ease: EASE.exit }}
             className="mt-2.5 min-h-0 overflow-hidden">
              {/* Amount as hero element — Motion System: in-place morph
                  (old ₼13.00 drifts up+blurs out, ₼17.00 settles in).
                  No counter roll, no full-card re-render. */}
              {displayAmount && (
                <div className="mb-2">
                  <Morph value={displayAmount} y={5}>
                    <span className={`block text-[32px] font-black tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                      ₼{displayAmount.toFixed(2)}
                    </span>
                  </Morph>
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

             </motion.div>
           )}
         </AnimatePresence>

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

           {/* Bottom row — 2026-09-23 (owner): the STATUS/HESAB label chips sit
               at the RIGHT (where the shopping+guest icons used to be); the
               guest/item counts moved to the TOP row, filling the empty space.
               LEFT now carries only the waiter name. (flex-flow mt-auto) */}
            <div className="mt-auto flex items-end justify-between gap-2">
             {/* LEFT: waiter name only */}
             <div className="flex items-center gap-2 flex-wrap min-w-0">
               {table.waiter_name && (
                 <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider select-none ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                   {table.waiter_name}
                 </span>
               )}
             </div>
             {/* RIGHT: status label chips + HESAB */}
              <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
                 <AnimatePresence mode="wait">
                {/* 2026-09-26 (Task 54 verify fix, P2): kitchen status chip —
                    normalize case ('PARTIALLY_READY' leak) + map every known
                    value to a localized label; NEVER render the raw enum. */}
                {(() => { const ks = String(kitchenStatus || '').toLowerCase(); return !showOccupiedFlash && isOccupied && showKitchenStatus && ks && !['completed', 'cancelled', 'ready'].includes(ks) && table.status !== 'served' && table.status !== 'dining'; })() ? (
                  <motion.div
                    key="kitchen"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4, transition: { duration: 0.28, ease: [0.45, 0, 0.55, 1] } }}
                    transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest [transition:background-color_0.2s_cubic-bezier(0.4,0,0.2,1),border-color_0.2s_cubic-bezier(0.4,0,0.2,1),color_0.2s_cubic-bezier(0.4,0,0.2,1)] ${
                        ['preparing', 'cooking', 'partially_ready'].includes(String(kitchenStatus).toLowerCase())
                          ? lightMode ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-blue-500/25 border-blue-400/50 text-blue-300'
                        : String(kitchenStatus).toLowerCase() === 'ready'
                          ? lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
                          : lightMode ? 'bg-zinc-100 border-zinc-300 text-zinc-600' : 'bg-white/10 border-white/20 text-zinc-300'
                    }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      ['preparing', 'cooking', 'partially_ready'].includes(String(kitchenStatus).toLowerCase()) ? (lightMode ? 'bg-blue-500 animate-pulse' : 'bg-blue-400 animate-pulse')
                        : String(kitchenStatus).toLowerCase() === 'ready' ? (lightMode ? 'bg-emerald-500' : 'bg-emerald-400')
                        : lightMode ? 'bg-zinc-400' : 'bg-white/40'
                    }`} />
                    {(() => { const ks2 = String(kitchenStatus).toLowerCase(); return ks2 === 'preparing' || ks2 === 'cooking' ? t('kitchen_preparing' as any) : ks2 === 'ready' ? t('table_ready' as any) : ks2 === 'new' ? t('kitchen_new_badge' as any) : ks2 === 'pending' ? t('kitchen_pending' as any) : t('kitchen_preparing' as any); })()}
                  </motion.div>
                ) : (
                 <motion.div
                   key="status"
                   initial={{ opacity: 0, y: 4 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -4, transition: { duration: 0.28, ease: [0.45, 0, 0.55, 1] } }}
                   transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest [transition:background-color_0.2s_cubic-bezier(0.4,0,0.2,1),border-color_0.2s_cubic-bezier(0.4,0,0.2,1),color_0.2s_cubic-bezier(0.4,0,0.2,1)] ${
                      seatedNoOrder
                        ? (lightMode ? 'bg-orange-100 border-orange-400 text-orange-700' : 'bg-orange-500/25 border-orange-400/60 text-orange-300')
                        : currentStatus.bg
                    }`}>
                    {StatusIcon && <StatusIcon size={10} strokeWidth={2.5} className={seatedNoOrder ? (lightMode ? 'text-orange-700' : 'text-orange-400') : currentStatus.iconColor} />}
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={showOccupiedFlash ? 'occupied-flash' : (seatedNoOrder ? 'seated-no-order' : currentStatus.label)}
                        initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                        transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                        className="whitespace-nowrap"
                      >
                        {showOccupiedFlash ? t('occupied' as any) : (seatedNoOrder ? t('seated_no_order' as any) : currentStatus.label)}
                      </motion.span>
                    </AnimatePresence>
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
              {/* HESAB chip: 2026-09-23 (owner) — was open-only. Now tappable to
                  CLOSE (bill_requested=false). Sits right of the status chip,
                  whitespace-nowrap so it never overlaps the status. */}
              {table.bill_requested && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleBill?.(); }}
                  title={t('bill_requested_cancel') || 'Hesabı bağla'}
                  className="shrink-0 h-[22px] flex items-center gap-1 px-2.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/30 text-[10px] font-black uppercase tracking-wide whitespace-nowrap transition-all active:scale-95"
                >
                  {t('bill_requested')}
                  <X size={11} strokeWidth={3} />
                </button>
              )}
              </div>
            </div>
        </motion.div>
    );
}
