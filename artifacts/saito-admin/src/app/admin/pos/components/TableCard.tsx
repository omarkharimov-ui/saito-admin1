'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, AlertTriangle, Users, Check, Clock, Link2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosTable } from '../types/shared';

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
  mergedChildren?: PosTable[];
}

export function TableCard({ table, onTap, onAction, isSelected, selectionMode, isTransferSource, isTransferTarget, isOverdue, overdueType, index = 0, mergedChildren = [] }: TableCardProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [delaySec, setDelaySec] = useState(0);

  const isOccupied = ['occupied', 'cooking', 'waiting_bill', 'merged'].includes(table.status);
  const isReserved = table.status === 'reserved';
  const isGroup = mergedChildren.length > 0;

  const childGuestTotal = mergedChildren.reduce((s, c) => s + (c.guest_count ?? 0), 0);
  const childAmountTotal = mergedChildren.reduce((s, c) => s + (c.total_amount ?? 0), 0);
  const totalGuest = (table.guest_count ?? 0) + childGuestTotal;
  const totalAmount = (table.total_amount ?? 0) + childAmountTotal;

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

  const formatDelay = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- GROUP CARD (Table X (+N) style) ---
  if (isGroup) {
    return (
      <div
        onClick={onTap}
        className={`relative h-[260px] rounded-[32px] p-6 text-left transition-all duration-300 overflow-hidden border-2 cursor-pointer
          ${lightMode ? 'bg-white border-indigo-300 shadow-md hover:shadow-lg' : 'bg-zinc-900 border-indigo-500/40 shadow-md hover:shadow-indigo-500/10'}`}
      >
        {/* Top accent bar */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${lightMode ? 'bg-indigo-400' : 'bg-indigo-500'}`} />

        {/* Header row: Table X (+N) */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <span className={`text-4xl font-black tracking-tighter ${lightMode ? 'text-indigo-700' : 'text-indigo-300'}`}>
              Masa {table.table_number}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${lightMode ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}>
              +{mergedChildren.length}
            </span>
          </div>
          {selectionMode ? (
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-blue-500 border-blue-500' : (lightMode ? 'bg-zinc-100 border-zinc-300' : 'bg-white/5 border-white/10')
            }`}>
              <AnimatePresence>{isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={18} className="text-white" strokeWidth={3} /></motion.div>}</AnimatePresence>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onAction(); }} className={`p-2 rounded-full transition-colors ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
              <MoreVertical size={20} className="opacity-30 hover:opacity-60" />
            </button>
          )}
        </div>

        {/* Guests + Total row */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <Users size={14} className={lightMode ? 'text-zinc-400' : 'text-zinc-500'} />
            <span className={`text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{totalGuest} nəf.</span>
          </div>
          <span className={`text-xl font-black tabular-nums ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
            ₼{totalAmount.toFixed(2)}
          </span>
        </div>

        {/* Merged tables list */}
        <div className="mt-3 space-y-1">
          <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <Link2 size={10} />
            Birləşmiş Masalar
          </div>
          <div className="flex flex-wrap gap-1.5">
            {/* Parent */}
            <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border
              ${lightMode ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
              <Check size={9} strokeWidth={3} />
              Masa {table.table_number}
              <span className="opacity-50 text-[8px] font-black ml-0.5">(əsas)</span>
            </div>
            {/* Children */}
            {mergedChildren.slice(0, 6).map(child => (
              <div key={child.table_number} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold
                ${lightMode ? 'bg-zinc-50 text-zinc-600 border border-zinc-200' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                Masa {child.table_number}
              </div>
            ))}
            {mergedChildren.length > 6 && (
              <div className={`text-[9px] font-bold opacity-40 px-1 py-1`}>+{mergedChildren.length - 6}</div>
            )}
          </div>
        </div>

        {/* Bottom status */}
        <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest
            ${lightMode ? 'bg-indigo-50 border-indigo-200 text-indigo-500' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${lightMode ? 'bg-indigo-400' : 'bg-indigo-500'}`} />
            Qrup
          </div>
          {delaySec > 0 && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-black tabular-nums
              ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-400' : 'bg-white/5 border-white/5 text-white/40'}`}>
              <Clock size={10} strokeWidth={3} />
              {formatDelay(delaySec)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- NORMAL / SINGLE TABLE CARD ---
  return (
    <div
      onClick={onTap}
      className={`relative h-[180px] rounded-[32px] p-6 text-left transition-all duration-300 group overflow-hidden border-2 cursor-pointer
        ${isTransferSource
          ? (lightMode ? 'bg-zinc-100 border-transparent opacity-60' : 'bg-zinc-800/50 border-transparent opacity-50')
          : isTransferTarget
            ? (lightMode ? 'bg-white border-zinc-400 border-dashed animate-pulse' : 'bg-zinc-900 border-zinc-400 border-dashed animate-pulse')
            : isSelected 
              ? (lightMode ? 'bg-white border-blue-500 shadow-[0_20px_40px_rgba(59,130,246,0.1)] scale-[1.02]' : 'bg-zinc-900 border-blue-500 shadow-[0_20px_40px_rgba(59,130,246,0.2)] scale-[1.02]') 
              : isReserved
                ? (lightMode ? 'bg-indigo-50/50 border-indigo-200' : 'bg-indigo-500/5 border-indigo-500/30')
                : isOverdue 
                  ? (lightMode ? 'bg-white border-rose-500 shadow-sm' : 'bg-zinc-900 border-rose-500 shadow-md')
                  : isOccupied
                    ? (lightMode ? 'bg-white border-emerald-500 shadow-sm' : 'bg-zinc-900 border-emerald-500/60 shadow-md')
                    : (lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900 border-white/10 shadow-sm')
        }`}
    >
      <span className={`absolute top-6 left-6 text-5xl font-black tracking-tighter transition-colors 
        ${isSelected || isReserved ? (lightMode ? 'text-indigo-600' : 'text-indigo-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
        {table.table_number}
      </span>

      {isReserved && (
        <div className="absolute top-[76px] left-6 right-6 flex flex-col gap-0.5">
          <span className={`text-lg font-bold truncate leading-tight ${lightMode ? 'text-indigo-950' : 'text-white'}`}>
            {table.reservation_name || table.reservation_phone || table.table_number}
          </span>
          
          <div className="flex items-center gap-3 opacity-60">
            {table.reservation_time && (
              <div className="flex items-center gap-1">
                <Clock size={12} className="text-indigo-400" />
                <span className="text-xs font-bold tabular-nums">{table.reservation_time}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users size={12} className="text-indigo-400" />
              <span className="text-xs font-bold tabular-nums">{table.guest_count}</span>
            </div>
          </div>
        </div>
      )}

      {!isReserved && (isOccupied || (table.guest_count ?? 0) > 0) && (
        <div className="absolute top-[72px] left-6 flex flex-col gap-1">
          { (table.guest_count ?? 0) > 0 && (
            <div className="flex items-center gap-1 opacity-60">
              <Users size={12} className={lightMode ? 'text-zinc-600' : 'text-zinc-400'} />
              <span className={`text-xs font-bold ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{table.guest_count}</span>
            </div>
          )}
          {delaySec > 0 && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-black tabular-nums
              ${delaySec > 1200 ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-white/5 border-white/5 text-white/40'}`}>
              <Clock size={10} strokeWidth={3} />
              {formatDelay(delaySec)}
            </div>
          )}
        </div>
      )}

      <div className="absolute top-4 right-4">
        {selectionMode ? (
          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
            isSelected ? 'bg-blue-500 border-blue-500' : (lightMode ? 'bg-zinc-100 border-zinc-300' : 'bg-white/5 border-white/10')
          }`}>
            <AnimatePresence>{isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={18} className="text-white" strokeWidth={3} /></motion.div>}</AnimatePresence>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onAction(); }} className="p-2 rounded-full transition-colors hover:bg-white/10">
            <MoreVertical size={20} className="text-white/20 group-hover:text-white/40" />
          </button>
        )}
      </div>

      <div className="absolute bottom-4 left-0 right-0 px-6 flex items-center justify-between">
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest
          ${isReserved 
            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' 
            : isOccupied 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
              : 'bg-white/5 border-white/5 text-white/30'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isReserved ? 'bg-indigo-400' : isOccupied ? 'bg-emerald-500' : 'bg-white/20'}`} />
          {isReserved ? t('reserved' as any) : isOccupied ? t('occupied' as any) : t('empty' as any)}
        </div>

        <div className="text-right">
          {isReserved ? (
            <span className="text-[10px] font-bold text-white/20 tabular-nums">{(table as any).reservation_phone || ''}</span>
          ) : table.total_amount > 0 ? (
            <p className={`text-lg font-black ${lightMode ? 'text-emerald-600' : 'text-emerald-500'}`}>₼{table.total_amount.toFixed(2)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
