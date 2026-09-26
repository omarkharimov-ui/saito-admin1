'use client';

import React, { useState } from 'react';
import { Trash2, Star, Pencil, RotateCcw, MoreVertical, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Reservation } from '@/types';

// 2026-09-26 (Task 55): the reservation CARD list was rejected by the owner
// ("KARTLAR İSTEMİRƏM") — replaced by a time-anchored "reservation book" row:
// [ HH:MM | divider | guest + subline | status / table / ⋮ ]. No boxed cards,
// no grid of boxes: one hairline-separated row per reservation.
// Data + handlers are unchanged — this is a pure presentation swap.

/** House micro-interaction spring (stiffness 500 / damping 26). */
const SPRING = { type: 'spring' as const, stiffness: 500, damping: 26 };

type ResLike = Reservation & {
  visitCount?: number;
  is_vip?: boolean;
  deposit_amount?: number | null;
};

interface Props {
  res: ResLike;
  /** Localized table label, e.g. "98" or "98 + 99" (null/undefined = none). */
  tableLabel?: string | null;
  /** GƏLƏCƏK / archive views: show the date under the time. */
  showDate?: boolean;
  /** Detail sheet is open for this row → gold accent border-left. */
  isActive?: boolean;
  onSelect: (res: any) => void;
  onEdit?: (res: any) => void;
  /** 2026-09-26 (owner fact-check): cancel (ləğv) with reason — the /api/reservations/cancel
      endpoint existed but had NO UI path (row menu was edit-only). */
  onCancel?: (id: string, name: string) => void;
  onDelete?: (id: string, name: string) => void;
  onRestore?: (id: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

/** Phone stays masked in the list (same privacy behaviour as the old card);
 *  the full number is visible in the detail sheet. */
const maskPhone = (phone: string) => {
  if (!phone) return '—';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 4) return phone;
  const last4 = clean.slice(-4);
  return `+994 •••• •• ${last4.slice(0, 2)} ${last4.slice(2)}`;
};

/** "2026-09-26" → "26.09" — string math, so no Intl/hydration drift. */
const shortDate = (date: string) =>
  date && date.length >= 10 ? `${date.slice(8, 10)}.${date.slice(5, 7)}` : '';

const isLate = (res: ResLike) => {
  if (res.status === 'archived' || res.status === 'cancelled' || res.status === 'completed' || res.status === 'no_show') return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!res.date) return false;
  if (res.date < today) return true;
  if (res.date === today && res.time) {
    const [h, m] = res.time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0);
    return Date.now() - target.getTime() > 0;
  }
  return false;
};

/** status enum → localized label key */
const statusKey = (status: string) => {
  switch (status) {
    case 'pending': return 'resv_status_pending' as const;
    case 'confirmed': return 'resv_status_confirmed' as const;
    case 'waiting': return 'resv_status_waiting' as const;
    case 'checked_in': return 'resv_status_checked_in' as const;
    case 'completed': return 'resv_status_completed' as const;
    case 'cancelled': return 'resv_status_cancelled' as const;
    case 'no_show': return 'resv_status_no_show' as const;
    case 'expired': return 'resv_status_expired' as const;
    case 'archived': return 'resv_status_archived' as const;
    default: return 'resv_status_pending' as const;
  }
};

/** One small ⋮ popover item (POS ActionSheet language: icon + uppercase label). */
const MenuItem = ({
  icon, label, danger, lightMode, onClick,
}: { icon: React.ReactNode; label: string; danger?: boolean; lightMode: boolean; onClick: () => void }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-left transition-colors ${
      danger
        ? (lightMode ? 'text-rose-600 hover:bg-rose-50' : 'text-rose-400 hover:bg-rose-500/10')
        : (lightMode ? 'text-zinc-600 hover:bg-zinc-100' : 'text-white/60 hover:bg-white/5')
    }`}
  >
    {icon}
    {label}
  </button>
);

export const ReservationRow = ({
  res,
  tableLabel,
  showDate,
  isActive,
  onSelect,
  onEdit,
  onCancel,
  onDelete,
  onRestore,
  selectionMode,
  isSelected,
  onToggleSelect,
}: Props) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = res.name || res.customer_name || 'Qonaq';
  const archived = res.status === 'archived' || res.status === 'cancelled';
  const late = isLate(res);
  const vip = !!res.is_vip;
  const deposit = Number(res.deposit_amount || 0);
  const guests = res.guests || 1;
  const note = (res.notes || res.note || '').trim();

  const subline = [`${guests} ${t('resv_guests_unit')}`, maskPhone(res.phone), note]
    .filter(Boolean)
    .join(' · ');

  const statusTone = archived
    ? 'cancelled'
    : res.status === 'confirmed' || res.status === 'checked_in' || res.status === 'completed'
      ? 'ok'
      : late
        ? 'late'
        : 'pending';

  const statusCls = statusTone === 'ok'
    ? (lightMode ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-green-500/10 text-green-400 border-green-500/25')
    : statusTone === 'late'
      ? (lightMode ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-rose-500/10 text-rose-400 border-rose-500/25')
      : statusTone === 'cancelled'
        ? (lightMode ? 'bg-zinc-100 text-zinc-500 border-zinc-200' : 'bg-white/5 text-white/40 border-white/10')
        : (lightMode ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/10 text-amber-400 border-amber-500/25');

  // VIP rows carry a subtle 2px gold rail; the open (selected) row gets the same
  // rail plus a faint gold wash — the only two "accents" in the list.
  const railCls = vip || isActive ? 'border-l-2 border-l-[#D4AF37]' : 'border-l-2 border-l-transparent';
  const bgCls = isActive
    ? (lightMode ? 'bg-amber-50/70' : 'bg-[#D4AF37]/[0.07]')
    : (lightMode ? 'hover:bg-zinc-50' : 'hover:bg-white/[0.03]');

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(v => !v);
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      whileTap={selectionMode ? undefined : { scale: 0.996 }}
      onClick={() => (selectionMode ? onToggleSelect?.(res.id) : onSelect(res))}
      className={`relative flex items-stretch gap-0 border-b cursor-pointer transition-colors duration-200 ${railCls} ${bgCls} ${
        lightMode ? 'border-b-zinc-100' : 'border-b-white/[0.05]'
      }`}
    >
      {/* ── LEFT: time anchor + vertical divider ── */}
      <div
        className={`relative shrink-0 w-[62px] sm:w-[86px] flex flex-col justify-center py-3.5 pr-2.5 sm:pr-4 border-r ${
          lightMode ? 'border-zinc-200/80' : 'border-white/[0.07]'
        }`}
      >
        <span
          className={`text-xl sm:text-2xl font-black tabular-nums leading-none tracking-tight ${
            lightMode ? 'text-zinc-900' : 'text-white'
          }`}
        >
          {res.time ? res.time.slice(0, 5) : '--:--'}
        </span>
        {showDate && (
          <span className={`mt-1 text-[9px] font-black tabular-nums tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
            {shortDate(res.date)}
          </span>
        )}
      </div>

      {/* ── MIDDLE: guest + subline ── */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-3.5 pl-3.5 sm:pl-4 pr-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {vip && <Star size={13} className="shrink-0 fill-[#D4AF37] text-[#D4AF37]" />}
          <span className={`font-black text-[15px] sm:text-base truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <p className={`flex-1 min-w-0 truncate text-[11px] font-medium ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>
            {subline}
          </p>
          {deposit > 0 && (
            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider tabular-nums ${
              lightMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-[#D4AF37]/10 border-[#D4AF37]/25 text-[#D4AF37]'
            }`}>
              {t('resv_deposit_chip')} ₼{deposit.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      {/* ── RIGHT: status + table + ⋮ ── */}
      <div
        className="shrink-0 flex flex-col items-end justify-center gap-1.5 py-3.5 pl-1 pr-2.5 sm:pr-3"
        onClick={(e) => e.stopPropagation()}
      >
        {selectionMode ? (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelect?.(res.id)}
            className="w-5 h-5 rounded accent-[#D4AF37] cursor-pointer"
          />
        ) : (
          <>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${statusCls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusTone === 'ok' ? 'bg-emerald-400' : statusTone === 'late' ? 'bg-rose-400' : statusTone === 'cancelled' ? 'bg-zinc-400' : 'bg-amber-400'}`} />
              {t(late && statusTone === 'late' ? 'resv_late' : statusKey(res.status))}
            </span>

            <div className="flex items-center gap-1.5">
              {tableLabel && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                  lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/10 text-white/60'
                }`}>
                  {t('resv_table')} {tableLabel}
                </span>
              )}
              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={SPRING}
                onClick={openMenu}
                title={t('resv_actions')}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  lightMode ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700' : 'text-white/35 hover:bg-white/10 hover:text-white'
                }`}
              >
                <MoreVertical size={16} />
              </motion.button>
            </div>
          </>
        )}
      </div>

      {/* ⋮ popover — invisible backdrop closes it, so no outside-click plumbing */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
              className={`absolute right-2 top-full z-30 mt-1 w-44 p-1.5 rounded-2xl border shadow-2xl ${
                lightMode ? 'bg-white border-zinc-200 shadow-zinc-300/40' : 'bg-[#141419] border-white/10 shadow-black/60'
              }`}
            >
              {onEdit && (
                <MenuItem lightMode={lightMode} icon={<Pencil size={13} />} label={t('resv_edit')} onClick={() => { setMenuOpen(false); onEdit(res); }} />
              )}
              {/* 2026-09-26 (owner fact-check): the missing LƏĞV path — active
                  rows get a cancel action (reason prompted by the page). */}
              {!archived && onCancel && (
                <MenuItem lightMode={lightMode} icon={<XCircle size={13} />} label={t('resv_cancel')} onClick={() => { setMenuOpen(false); onCancel(res.id, displayName); }} />
              )}
              {archived && onRestore && (
                <MenuItem lightMode={lightMode} icon={<RotateCcw size={13} />} label={t('resv_restore')} onClick={() => { setMenuOpen(false); onRestore(res.id); }} />
              )}
              {archived && onDelete && (
                <MenuItem lightMode={lightMode} danger icon={<Trash2 size={13} />} label={t('resv_delete')} onClick={() => { setMenuOpen(false); onDelete(res.id, displayName); }} />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/** @deprecated 2026-09-26 (Task 55) — the card list was rejected by the owner.
 *  Kept as an alias so any stale import keeps compiling. */
export const ReservationCard = ReservationRow;

/** Kept for callers that need the shared status label key. */
export const reservationStatusKey = statusKey;
