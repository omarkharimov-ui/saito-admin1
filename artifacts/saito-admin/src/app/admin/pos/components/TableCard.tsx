'use client';

import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
// 2026-09-29 (owner: "kart statuslarının iconlarını yeniden düzəlt"): every
// status now has a DISTINCT, semantically-correct Phosphor glyph — the old
// set recycled CheckCircle2/Utensils/Receipt across 6+ states and left
// dirty/cleaning/empty with NO icon.
import { MoreVertical, Users, ShoppingBag, UserCheck, CalendarDays, CreditCard, Receipt, CheckCircle2, CheckCheck, Utensils, X, Layers, BrushCleaning, CookingPot, ClipboardCheck, ChefHat, BellRing, HandPlatter, Banknote, Table2 } from '@/components/ui/saito-icons';
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

  // 'merged' (12j, E2E catch: "Masa 4·5 kartında SERVİSƏ chip yoxdu"): the
  // group PARENT row carries status='merged' in table_floors — it was MISSING
  // from this list, so isOccupied=false and the kitchen chip's gate
  // (line ~703: isOccupied && showKitchenStatus) could never open for a
  // group card, no matter what the group's kitchen state was. Merged =
  // in-use by definition. Side effect check: seat/occupied-flash rings are
  // prev-status-gated ('empty'→occupied / 'occupied'→free) — 'merged' is
  // neither, so no spurious rings; merge (occupied→merged) previously
  // fired a FALSE occupied-flash via the isOccupied flip — now gone.
  const isOccupied = ['ordering', 'occupied', 'merged', 'cooking', 'waiting_bill', 'waiting', 'ordered', 'confirmed', 'in_kitchen', 'served', 'dining', 'bill_requested', 'payment_pending', 'paid', 'cleaning'].includes(table.status);
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
      icon: CalendarDays,
      label: t('reserved' as any),
      bg: lightMode ? 'bg-indigo-100 border-indigo-400 text-indigo-800' : 'bg-indigo-500/25 border-indigo-400/60 text-indigo-300',
      iconColor: lightMode ? 'text-indigo-700' : 'text-indigo-400',
      dotColor: lightMode ? 'bg-indigo-500' : 'bg-indigo-400',
    },
    dirty: {
      icon: BrushCleaning,
      label: t('dirty' as any),
      bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300', // 2026-09-29 (owner: "light-da statuslar qapı-qara olmasın — qara modda necədirsə elə olsun")
      iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
      dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
    },
    waiting: {
      icon: BrushCleaning,
      label: t('waiting' as any),
      bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300', // 2026-09-29 (owner: "light-da statuslar qapı-qara olmasın — qara modda necədirsə elə olsun")
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
      icon: CookingPot,
      label: t('occupied' as any),
      bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
      iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
      dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
    },
     ordered: {
        icon: ClipboardCheck,
       label: t('table_ordered' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
      confirmed: {
        icon: CheckCheck,
       label: t('table_confirmed' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
      in_kitchen: {
        icon: ChefHat,
       label: t('table_in_kitchen' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
      ready: {
        icon: BellRing,
       label: t('table_ready' as any),
      bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300', // 2026-09-29 (owner: "light-da statuslar qapı-qara olmasın — qara modda necədirsə elə olsun")
        iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
        dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
     },
      served: {
        icon: HandPlatter,
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
        icon: Users,
       label: t('order_served' as any),
       bg: lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300',
       iconColor: lightMode ? 'text-emerald-700' : 'text-emerald-400',
       dotColor: lightMode ? 'bg-emerald-500' : 'bg-emerald-400',
     },
      bill_requested: {
        icon: Banknote,
       label: t('bill_requested' as any),
       bg: lightMode ? 'bg-rose-100 border-rose-400 text-rose-800' : 'bg-rose-500/25 border-rose-400/60 text-rose-300',
       iconColor: lightMode ? 'text-rose-700' : 'text-rose-400',
       dotColor: lightMode ? 'bg-rose-500' : 'bg-rose-400',
     },
     payment_pending: {
       icon: CreditCard,
       label: t('payment_pending' as any),
      bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300', // 2026-09-29 (owner: "light-da statuslar qapı-qara olmasın — qara modda necədirsə elə olsun")
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
        icon: BrushCleaning,
       label: t('needs_cleaning' as any),
      bg: lightMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-500/25 border-amber-400/60 text-amber-300', // 2026-09-29 (owner: "light-da statuslar qapı-qara olmasın — qara modda necədirsə elə olsun")
        iconColor: lightMode ? 'text-amber-700' : 'text-amber-400',
        dotColor: lightMode ? 'bg-amber-500' : 'bg-amber-400',
     },
       empty: {
        icon: Table2,
       label: t('empty' as any),
       bg: lightMode ? 'bg-zinc-100 border-zinc-300 text-zinc-500' : 'bg-white/10 border-white/20 text-zinc-400',
       iconColor: lightMode ? 'text-zinc-500' : 'text-zinc-400',
       dotColor: lightMode ? 'bg-zinc-400' : 'bg-white/30',
     },
      // 2026-09-28 (owner: "status ikonlarini duzgun sec — eksik olana doğru şey"):
      // 'merged' (group child table) was MISSING here → fell back to the
      // "Boş" empty-chip, so a merged table read as FREE. Layers = grouped.
      merged: {
        icon: Layers,
        label: t('group_label' as any) || 'Qrup',
        bg: lightMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-blue-500/20 border-blue-400/40 text-blue-300',
        iconColor: lightMode ? 'text-blue-600' : 'text-blue-300',
        dotColor: lightMode ? 'bg-blue-500' : 'bg-blue-400',
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
        ? (lightMode ? 'border-blue-500' : 'border-amber-500/60') // 2026-09-28 (owner: light — mavi)
        : isReserved
          ? (lightMode ? 'border-indigo-300' : 'border-indigo-500/40')
          : isDirty || isWaiting
            ? (lightMode ? 'border-zinc-500' : 'border-amber-500/40') // 2026-09-28 (owner: light — qara)
            : isOccupied
              ? (lightMode ? 'border-emerald-400/70' : 'border-emerald-500/45')
               // 2026-09-27 (owner: "borderleri hamisi agdir nie"): an EMPTY
               // table shows NO border in EITHER theme. Dark: the surface
               // (#141419) already defines the edge. Light: shadow-sm (in the
               // base classes) defines the white card — a zinc-200 "white line
               // on white card" across 90+ tables read as a washed-out grid.
               // Only tables with a REAL state get the accent border. Green
               // also now "yaranır" from transparent — same 320ms grace fade.
               : 'border-transparent';

  // 2026-09-27 (owner: "yaşıl border anidən yox olur — mavi border kimi təbii
  // fade-out olsun"): border-color lives in the GRACE band (320ms symmetric
  // in-out) — the same easing family as the content's graceful exit, so border
  // + numbers + pill drift away together as ONE motion, never a snap.
  // ⚠️ NEVER put a /* comment */ INSIDE the className template below — the
  // browser splits the class attribute on whitespace, so ANY plain word in a
  // comment (e.g. "ring", "border", "shadow") becomes a LIVE Tailwind class.
  // That exact bug painted a 1px white ring on every table card (2026-09-27).
  return (
         <motion.div
         onClick={() => { onTap(); }}
         animate={cardControls}
         whileTap={{ scale: 0.97 }}
         transition={SPRING.press}
         className={`relative h-[180px] rounded-4xl p-5 text-left overflow-hidden border cursor-pointer group flex flex-col
           [transition:border-color_0.32s_cubic-bezier(0.45,0,0.55,1),background-color_0.2s_cubic-bezier(0.4,0,0.2,1),box-shadow_0.2s_cubic-bezier(0.4,0,0.2,1),opacity_0.14s_ease-out]
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
                <span className={`${(isGroup && groupNumber) || table.pre_order ? 'text-lg' : 'text-2xl'} font-black tracking-tighter whitespace-nowrap ${isSelected ? (lightMode ? 'text-zinc-900' : 'text-white') : isDirty ? (lightMode ? 'text-zinc-900' : 'text-amber-400') : isWaiting ? (lightMode ? 'text-zinc-900' : 'text-amber-400') : isReserved ? (lightMode ? 'text-indigo-600' : 'text-indigo-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
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
              {/* 2026-09-28 (owner video: "dots çevirilib olur daire kimi" + "ağ
                  tik soldan başlayıb sağa doğru doldur"): ROTATION MORPH — the
                  dots don't crossfade away, they SPIN OUT (rotate +120°) while
                  the circle SPINS IN from the same direction (−120° → 0°);
                  shared rotation direction = one continuous turn, so it reads
                  as "the dots rotated and became the circle" (Philosophy §2
                  continuity + §5 morph-not-replace). The check is DRAWN, not
                  popped: an SVG path animated via pathLength 0→1 (stroke
                  draws left→vertex→right, like Apple's SF-Symbol checkmark
                  draw), starting just as the circle lands. */}
              <AnimatePresence mode="popLayout" initial={false}>
                {isTransferSource ? (
                  <motion.div
                    key="ctl-source"
                    initial={{ rotate: -120, scale: 0.4, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    exit={{ rotate: 120, scale: 0.4, opacity: 0, transition: { duration: 0.16 } }}
                    transition={SPRING.kessey}
                    className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center"
                  >
                    <span className="text-xs font-black text-rose-400">M</span>
                  </motion.div>
                ) : isTransferTarget ? (
                  <motion.div
                    key="ctl-target"
                    initial={{ rotate: -120, scale: 0.4, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    exit={{ rotate: 120, scale: 0.4, opacity: 0, transition: { duration: 0.16 } }}
                    transition={SPRING.kessey}
                    className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center animate-pulse"
                  >
                    <span className="text-xs font-black text-emerald-400">H</span>
                  </motion.div>
                ) : selectionMode ? (
                  // 2026-09-30 (owner, round 8: "3-dotsdan tike keçən BİR
                  // morph-da et"): the dots exit spinning +120° (clockwise)
                  // while the circle used to enter from −120° (COUNTER-clockwise)
                  // — opposite directions read as three separate motions
                  // (spin-out / spin-in / tick-draw). Now the circle enters
                  // from +120° → 0: the SAME clockwise rotation continues
                  // through the swap, so ⋮ → ○ → ✓ reads as ONE morph
                  // (dots spin into the circle, tick draws on top).
                  <motion.div
                    key="ctl-select"
                    initial={{ rotate: 120, scale: 0.4, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    exit={{ rotate: -120, scale: 0.4, opacity: 0, transition: { duration: 0.16 } }}
                    transition={SPRING.kessey}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center [transition:background-color_0.18s_ease,border-color_0.18s_ease] ${
                      isSelected ? 'bg-blue-500 border-blue-500' : (lightMode ? 'bg-zinc-100 border-zinc-300' : 'bg-white/5 border-white/10')
                    }`}
                  >
                    <AnimatePresence initial={false}>
                      {isSelected && (
                        <motion.svg
                          key="sel-tick"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          initial="hidden"
                          animate="show"
                          exit="hidden"
                        >
                          {/* Path starts at the LEFT (4,12.5) → bottom vertex
                              (9.5,18) → up-right tip (20,6.5): pathLength 0→1
                              draws exactly left-to-right, the Apple way. */}
                          <motion.path
                            d="M4 12.5 L9.5 18 L20 6.5"
                            stroke="white"
                            strokeWidth={3.4}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            variants={{
                              hidden: { pathLength: 0, opacity: 0 },
                              show: {
                                pathLength: 1,
                                opacity: 1,
                                transition: {
                                  pathLength: { duration: 0.28, ease: 'easeOut', delay: 0.08 },
                                  opacity: { duration: 0.08 },
                                },
                              },
                              exit: { pathLength: 0, opacity: 0, transition: { duration: 0.14 } },
                            }}
                          />
                        </motion.svg>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <motion.button
                    key="ctl-menu"
                    // 2026-09-29 (owner, round 7: "birlesidr normal taba kecede
                    // 3 dots blink etdi"): the ⋮ used to RE-SPIN IN (rotate −120°→0,
                    // scale 0.4→1) every time selection/merge mode exited — that
                    // re-entry read as a "blink". The dramatic rotation morph is
                    // KEPT for dots→circle (owner-approved video pattern); the
                    // circle→dots RETURN is now a calm 180ms fade (no spin-in).
                    // Opacity is framer-owned now: the old CSS `opacity-40
                    // hover:opacity-100` fought framer's inline opacity:1 (rest
                    // rendered 100%, hover was a no-op) — resting 0.4, hover 1.0.
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 0.4, scale: 1 }}
                    exit={{ rotate: 120, scale: 0.4, opacity: 0, transition: { duration: 0.16 } }}
                    whileHover={{ opacity: 1 }}
                    whileTap={{ scale: 0.9, opacity: 1 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    onClick={(e) => { e.stopPropagation(); onAction(); }}
                    className="p-1 rounded-full transition-colors"
                  >
                    <MoreVertical size={15} className={`${lightMode ? 'text-zinc-400' : 'text-white/50'}`} />
                  </motion.button>
                )}
              </AnimatePresence>
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
               {/* 2026-09-29 (owner, figure 2: "guest və shoppingbag qiymətlə
                   masa yazısının ORTASINA"): the counters now live on their own
                   quiet row BETWEEN the "Masa X" title and the ₼ amount hero
                   (removed from the title row) — supporting data, muted style
                   kept. Morphs in place when the guest count changes. */}
               {(displayGuests || (table.item_count ?? 0) > 0) && (
                 <div className="flex items-center gap-3 mb-1.5">
                   {displayGuests && (
                     <span className={`inline-flex items-center gap-1 text-[12px] font-bold tabular-nums ${lightMode ? 'text-zinc-500' : 'text-white/55'}`}>
                       <Users size={13} strokeWidth={2.5} />
                       <Morph value={displayGuests} y={3} duration={T.quick}>{displayGuests}</Morph>
                     </span>
                   )}
                   {(table.item_count ?? 0) > 0 && (
                     <span className={`inline-flex items-center gap-1 text-[12px] font-bold tabular-nums ${lightMode ? 'text-zinc-500' : 'text-white/55'}`}>
                       <ShoppingBag size={13} strokeWidth={2.5} />
                       {table.item_count}
                     </span>
                   )}
                 </div>
               )}
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
                 <span className={`text-sm font-bold truncate ${lightMode ? 'text-zinc-900' : 'text-amber-300'}`}>
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

          {/* Group children numbers — 2026-09-27 (owner: "kartların məlumatları
              bir-birinə girib"): the absolute top-[68px] right stack was
              REMOVED (it collided with the amount hero zone); the children now
              ride inline in the top row after the group badge (see above). */}


           {/* Bottom row — 2026-09-23 (owner): the STATUS/HESAB label chips sit
               at the RIGHT (where the shopping+guest icons used to be); the
               guest/item counts moved to the TOP row, filling the empty space.
               LEFT now carries only the waiter name. (flex-flow mt-auto) */}
              {/* 2026-09-29 (light audit, Masa 17): on narrow cards the group
                  chip ("16 · 18") and the status pill collided — flex-wrap lets
                  the pill drop to its own line instead of overlapping. */}
              <div className="mt-auto flex items-end gap-2 flex-wrap">
               {/* LEFT: merged children chip (2026-09-27: moved here from the
                   top row — the top row was crowded and the chip collided
                   with the guest/item counters, E2E overlap catch) + waiter. */}
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {isGroup && mergedChildNumbers && mergedChildNumbers.length > 0 && (
                  <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none tabular-nums whitespace-nowrap ${
                    lightMode ? 'bg-blue-50 border border-blue-200 text-blue-600' : 'bg-white/5 border border-white/10 text-white/50'
                  }`}>
                    {mergedChildNumbers.join(' · ')}
                  </span>
                )}
                {table.waiter_name && (
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider select-none ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                    {table.waiter_name}
                  </span>
                )}
              </div>
              {/* RIGHT: status label chips + HESAB — ml-auto (with the
                  row's flex-wrap) keeps the pill right-aligned even when it
                  wraps under the group chip on narrow cards. */}
                <div className="ml-auto flex items-center gap-2 flex-wrap justify-end min-w-0">
                  {/* 2026-09-26 (Task 54 verify fix, P2): kitchen status chip —
                      normalize case ('PARTIALLY_READY' leak) + map every known
                      value to a localized label; NEVER render the raw enum. */}
                  {/* 12j (owner: "POS-da Hazırlanır / Servis et / Servis
                      edildi statusları görünmür — aydın və ardıcıl göstər"):
                      the kitchen chip now shows for EVERY live workflow state
                      (GÖZLƏYİR → HAZIRLANIR → SERVİSƏ → SERVİS EDİLDİ) and is
                      hidden only for terminal kitchen states. The 12i
                      "hidden for ready/served" rule — which made exactly the
                      states the owner needs to SEE invisible — is removed.
                      12j E2E root cause #3 ("Dolu" pill stuck at opacity:0):
                      the old kitchen↔status swap was AnimatePresence
                      mode="wait" with TWO keyed motion.divs — when the
                      condition flipped mid-transition (SWR snapshot,
                      floor-swap remount, HMR) the EXIT never resolved and the
                      incoming chip froze at its INITIAL state (opacity 0,
                      translateY 4px) = invisible FOREVER. The DOM proved it.
                      Now: ONE persistent element — no key, no AnimatePresence,
                      no initial — bg/border/color/label morph IN PLACE via CSS
                      transitions (the same 12j no-blink pattern as the KDS
                      CTA). The chip can never be "stuck invisible" again. */}
                  {(() => {
                    const ks = String(kitchenStatus || '').toLowerCase();
                    const showKitchen = !showOccupiedFlash && isOccupied && showKitchenStatus && ks && !['completed', 'cancelled'].includes(ks);
                    const isPrep = ['preparing', 'cooking', 'partially_ready', 'accepted', 'sent'].includes(ks);
                    const isDone = ['ready', 'served'].includes(ks);
                    const bg = showKitchen
                      ? (isPrep
                          ? (lightMode ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-blue-500/25 border-blue-400/50 text-blue-300')
                          : isDone
                            ? (lightMode ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300')
                            : (lightMode ? 'bg-zinc-100 border-zinc-300 text-zinc-600' : 'bg-white/10 border-white/20 text-zinc-300'))
                      : (seatedNoOrder
                          // 2026-09-29 (owner: "light-da statuslar qapı-qara
                          // olmasın"): dark = orange → light mirrors it.
                          ? (lightMode ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-orange-500/25 border-orange-400/60 text-orange-300')
                          : currentStatus.bg);
                    const label = showKitchen
                      // 12j: the floor chip speaks the SAME canonical
                      // vocabulary as the KDS board (ardıcıl): 'ready' =
                      // SERVİSƏ — the actionable signal for the server (the
                      // 3 s KDS flip is a kitchen-side detail, not a floor one).
                      ? (ks === 'partially_ready' ? t('bds_k_partially' as any)
                        : ks === 'ready' ? t('kds_chip_serve' as any)
                        : ks === 'served' ? t('kds_st_served' as any)
                        : (ks === 'pending' || ks === 'new') ? t('kds_st_waiting' as any)
                        : t('kds_st_preparing' as any))
                      : (showOccupiedFlash ? t('occupied' as any)
                        : seatedNoOrder ? t('seated_no_order' as any)
                        : currentStatus.label);
                    return (
                      <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest [transition:background-color_0.2s_cubic-bezier(0.4,0,0.2,1),border-color_0.2s_cubic-bezier(0.4,0,0.2,1),color_0.2s_cubic-bezier(0.4,0,0.2,1)] ${bg}`}>
                        {showKitchen ? (
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isPrep ? (lightMode ? 'bg-blue-500 animate-pulse' : 'bg-blue-400 animate-pulse')
                              : isDone ? (lightMode ? 'bg-emerald-500' : 'bg-emerald-400')
                              : (lightMode ? 'bg-zinc-400' : 'bg-white/40')
                          }`} />
                        ) : (
                          StatusIcon && <StatusIcon size={10} strokeWidth={2.5} className={seatedNoOrder ? (lightMode ? 'text-orange-600' : 'text-orange-400') : currentStatus.iconColor} />
                        )}
                        <span className="whitespace-nowrap">{label}</span>
                        {table.status === 'dirty' && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v15" />
                            <path d="M5 20h14v4H5z" />
                            <path d="M9 16c1-2 3-2 6 0" />
                          </svg>
                        )}
                      </div>
                    );
                  })()}
              {/* HESAB chip: 2026-09-23 (owner) — was open-only. Now tappable to
                  CLOSE (bill_requested=false). Sits right of the status chip,
                  whitespace-nowrap so it never overlaps the status. */}
               {/* 2026-09-28 (owner: "harada state-machine transition YOXDURsə
                   əlavə et"): HESAB chip was a hard on/off (no AnimatePresence) —
                   it snapped in when the bill was requested and snapped out on
                   close. Now a keyed spring pop: enter from scale 0.5 (kessey),
                   exit fast shrink+fade. bill_requested is a real STATE change
                   (Philosophy §1/§9) so it gets a visible, continuous result. */}
               <AnimatePresence initial={false}>
               {table.bill_requested && (
                 <motion.button
                   key="hesab-chip"
                   initial={{ scale: 0.5, opacity: 0 }}
                   animate={{ scale: 1, opacity: 1 }}
                   exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.14 } }}
                   transition={SPRING.kessey}
                   onClick={(e) => { e.stopPropagation(); onToggleBill?.(); }}
                   title={t('bill_requested_cancel') || 'Hesabı bağla'}
                   className="shrink-0 h-[22px] flex items-center gap-1 px-2.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/30 text-[10px] font-black uppercase tracking-wide whitespace-nowrap transition-all active:scale-95"
                 >
                   {t('bill_requested')}
                   <X size={11} strokeWidth={3} />
                 </motion.button>
               )}
               </AnimatePresence>
              </div>
            </div>
        </motion.div>
    );
}
