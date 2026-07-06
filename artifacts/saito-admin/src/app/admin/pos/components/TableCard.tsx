'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, AlertTriangle, Users, Check, Clock, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosTable } from '../types/shared';

interface TableCardProps {
  table: PosTable;
  onTap: () => void;
  onAction: () => void;
  onChildTap?: (child: PosTable) => void;
  isSelected?: boolean;
  selectionMode?: boolean;
  isMergeParent?: boolean;
  isTransferSource?: boolean;
  isTransferTarget?: boolean;
  isOverdue?: boolean;
  overdueType?: 'not_accepted' | 'preparing';
  index?: number;
  mergedChildren?: PosTable[];
}

export function TableCard({ table, onTap, onAction, onChildTap, isSelected, selectionMode, isMergeParent, isTransferSource, isTransferTarget, isOverdue, overdueType, index = 0, mergedChildren = [] }: TableCardProps) {
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

  // --- GROUP CARD ---
  if (isGroup) {
    return (
      <div
        onClick={onTap}
        className={`relative h-[220px] rounded-[32px] p-6 text-left transition-all duration-300 group overflow-hidden border-2 cursor-pointer
          ${lightMode ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-indigo-950/20 border-indigo-500/20 shadow-md'}`}
      >
        {/* Group badge */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${lightMode ? 'bg-indigo-400' : 'bg-indigo-500'}`} />

        <div className="flex items-center gap-2 mb-1">
          <div className={`px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest ${lightMode ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'}`}>
            QRUP
          </div>
          <span className={`text-4xl font-black tracking-tighter ${lightMode ? 'text-indigo-800' : 'text-indigo-300'}`}>
            {table.table_number}
          </span>
        </div>

        {/* Child tables list */}
        <div className="mt-3 space-y-1.5">
          {[table, ...mergedChildren].slice(0, 5).map((child) => (
            <div
              key={child.table_number}
              onClick={(e) => {
                e.stopPropagation();
                if (child.table_number === table.table_number) onTap();
                else onChildTap?.(child);
              }}
              className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all
                ${lightMode ? 'bg-white/70 text-zinc-700 hover:bg-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${lightMode ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}>
                  {child.table_number}
                </span>
                <span>{child.table_number === table.table_number ? '(əsas)' : ''}</span>
              </div>
              <div className="flex items-center gap-3">
                {(child.guest_count ?? 0) > 0 && (
                  <span className="opacity-50">{child.guest_count ?? 0} nəf.</span>
                )}
                <span className="tabular-nums">₼{(child.total_amount ?? 0).toFixed(2)}</span>
              </div>
            </div>
          ))}
          {mergedChildren.length > 4 && (
            <div className="text-[9px] font-bold opacity-40 text-center">+{mergedChildren.length - 4} daha</div>
          )}
        </div>

        {/* Group totals */}
        <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users size={12} className="opacity-40" />
            <span className={`text-[10px] font-bold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{totalGuest} nəf.</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest
              ${lightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/10 text-emerald-400'}`}>
              Qrup
            </div>
            <span className={`text-lg font-black tabular-nums ${lightMode ? 'text-indigo-700' : 'text-indigo-400'}`}>
              ₼{totalAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {selectionMode && (
          <div className="absolute top-4 right-4 z-10">
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-blue-500 border-blue-500' : (lightMode ? 'bg-white border-zinc-300' : 'bg-white/5 border-white/10')
            }`}>
              <AnimatePresence>{isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={18} className="text-white" strokeWidth={3} /></motion.div>}</AnimatePresence>
            </div>
          </div>
        )}
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

      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isMergeParent && (
          <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${lightMode ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-amber-500/20 border-amber-500/40 text-amber-400'}`}>
            Əsas
          </div>
        )}
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
