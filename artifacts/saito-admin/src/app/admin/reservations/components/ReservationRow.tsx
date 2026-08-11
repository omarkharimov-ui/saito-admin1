'use client';

import React from 'react';
import { Calendar, Users, Phone, Clock, Trash2, Star, UserPlus, Zap, ShoppingBag, Pencil } from 'lucide-react';

import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Reservation } from '@/types';

interface Props {
  res: Reservation & { visitCount?: number };
  statusBadge: (status: string) => React.ReactNode;
  onEdit?: (res: any) => void;
  onDelete?: (id: string, name: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onSelect: (res: any) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const maskPhone = (phone: string) => {
  if (!phone) return '—';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 4) return phone;
  const last4 = clean.slice(-4);
  return `+994 •••• •• ${last4.slice(0, 2)} ${last4.slice(2)}`;
};

const getGuestTag = (count: number, lightMode: boolean) => {
  if (count > 5) return {
    label: 'VIP', icon: Star,
    color: lightMode ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30',
  };
  if (count > 1) return { label: 'Regular', icon: Zap, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
  return { label: 'Yeni', icon: UserPlus, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
};

const isLate = (res: Reservation) => {
  if (res.status === 'archived' || res.status === 'cancelled' || res.status === 'completed') return false;
  const today = new Date().toISOString().split('T')[0];
  if (res.date < today) return true;
  if (res.date === today && res.time) {
    const [h, m] = res.time.split(':').map(Number);
    const resTime = new Date();
    resTime.setHours(h, m, 0);
    return new Date().getTime() - resTime.getTime() > 0;
  }
  return false;
};

const parsePreOrder = (res: Reservation): { count: number; total: number } => {
  const items = res.pre_order_items;
  const arr = Array.isArray(items)
    ? items
    : typeof items === 'string'
      ? JSON.parse(items)
      : null;
  if (arr && arr.length > 0) {
    const total = arr.reduce((s: number, i: any) => s + (Number(i.total_price ?? i.unit_price) || 0) * (i.quantity || 1), 0);
    return { count: arr.length, total };
  }
  if (res.pre_order_total) return { count: 0, total: Number(res.pre_order_total) || 0 };
  return { count: 0, total: 0 };
};

export const ReservationCard = ({
  res,
  statusBadge,
  onEdit,
  onDelete,
  onArchive,
  onRestore,
  onSelect,
  selectionMode,
  isSelected,
  onToggleSelect,
}: Props) => {
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1, lightMode);
  const displayName = res.name || res.customer_name || 'Qonaq';
  const late = isLate(res);
  const pre = parsePreOrder(res);
  const hasPreOrder = pre.count > 0 || pre.total > 0;
  const archived = res.status === 'archived' || res.status === 'cancelled';

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={() => (selectionMode ? onToggleSelect?.(res.id) : onSelect(res))}
      className={`relative rounded-[2rem] border-2 p-5 md:p-6 flex flex-col gap-4 overflow-hidden cursor-pointer transition-all duration-300 shadow-2xl ${
        isSelected
          ? (lightMode ? 'bg-amber-50 border-blue-400 shadow-blue-200/60' : 'bg-amber-500/10 border-blue-400 shadow-black/60')
          : lightMode
            ? 'bg-white border-amber-300/70 shadow-amber-100/50 hover:border-amber-400'
            : 'bg-[#101012] border-[#D4AF37]/25 shadow-black/60 hover:border-[#D4AF37]/50'
      }`}
    >
      {/* left gold accent bar — distinguishes reservation from order cards */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#F5D67B] to-[#D4AF37]" />

      {selectionMode && (
        <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect?.(res.id)}
            className="w-5 h-5 rounded accent-blue-500 cursor-pointer"
          />
        </div>
      )}

      {/* top: eyebrow + big status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${lightMode ? 'text-amber-600' : 'text-[#D4AF37]'}`}>
            REZERVASİYA
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`font-black text-lg md:text-xl leading-none truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
              {displayName}
            </span>
            <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase whitespace-nowrap ${tag.color}`}>
              {tag.label}
            </span>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-medium mt-1.5 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
            <Phone size={11} className="opacity-40" /> {maskPhone(res.phone)}
          </span>
        </div>
        <div className="flex-shrink-0">{statusBadge(res.status)}</div>
      </div>

      {/* date & time */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold">
        <span className={`flex items-center gap-2 ${lightMode ? 'text-zinc-600' : 'text-white/80'}`}>
          <Calendar size={14} className="opacity-30" /> {new Date(res.date).toLocaleDateString('az-AZ')}
        </span>
        <span className={`flex items-center gap-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
          <Clock size={14} className="opacity-30" /> {res.time}
          {late && (
            <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[9px] font-black uppercase tracking-widest">
              Vaxtı keçib
            </span>
          )}
        </span>
      </div>

      {/* hero row: guest count (main info) + pre-order (distinct) */}
      <div className={`grid gap-3 ${hasPreOrder ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-1'}`}>
        <div
          className={`flex items-center gap-4 px-5 py-4 rounded-2xl border ${
            lightMode ? 'bg-amber-50 border-amber-200' : 'bg-[#D4AF37]/10 border-[#D4AF37]/25'
          }`}
        >
          <Users size={28} className={`flex-shrink-0 ${lightMode ? 'text-amber-600' : 'text-[#D4AF37]'}`} />
          <div>
            <span className={`text-3xl md:text-4xl font-black leading-none ${lightMode ? 'text-amber-600' : 'text-[#D4AF37]'}`}>
              {res.guests}
            </span>
            <p className={`text-[9px] font-black uppercase tracking-[0.2em] mt-1 ${lightMode ? 'text-amber-700/60' : 'text-[#D4AF37]/60'}`}>
              Nəfər
            </p>
          </div>
        </div>

        {hasPreOrder && (
          <div
            className={`flex items-center justify-between gap-3 px-5 py-4 rounded-2xl border border-dashed ${
              lightMode ? 'bg-amber-100/60 border-amber-300' : 'bg-amber-500/15 border-amber-500/40'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${lightMode ? 'bg-amber-200/70 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`}>
                <ShoppingBag size={22} />
              </div>
              <div className="min-w-0">
                <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${lightMode ? 'text-amber-700' : 'text-amber-400'}`}>
                  Öncədən Sifariş
                </p>
                {pre.count > 0 && (
                  <p className={`text-sm font-black truncate mt-0.5 ${lightMode ? 'text-zinc-800' : 'text-white'}`}>
                    {pre.count} məhsul
                  </p>
                )}
              </div>
            </div>
            <span className={`font-black text-xl tabular-nums flex-shrink-0 ${lightMode ? 'text-amber-700' : 'text-amber-400'}`}>
              ₼{pre.total.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* note */}
      {(res.notes || res.note) && (
        <p className={`text-[11px] italic truncate ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
          “{res.notes || res.note}”
        </p>
      )}

      {/* actions */}
      <div className="flex items-center gap-2 mt-auto pt-1" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <button
            title="Düzəliş"
            onClick={() => onEdit(res)}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
              lightMode ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Pencil size={15} />
          </button>
        )}
        {archived && onRestore && (
          <button
            title="Bərpa et"
            onClick={() => onRestore(res.id)}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
              lightMode ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            <Zap size={15} />
          </button>
        )}
        {archived && onDelete && (
          <button
            title="Sil"
            onClick={() => onDelete(res.id, displayName)}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
              lightMode ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
            }`}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </motion.div>
  );
};
