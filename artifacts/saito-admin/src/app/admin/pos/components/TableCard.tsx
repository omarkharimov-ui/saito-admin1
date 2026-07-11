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
}

export function TableCard({ table, onTap, onAction, isSelected, selectionMode, isTransferSource, isTransferTarget, isOverdue, overdueType, index = 0, groupNumber, mergedChildNumbers, isMergedChild }: TableCardProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [delaySec, setDelaySec] = useState(0);

  const isOccupied = ['occupied', 'cooking', 'waiting_bill'].includes(table.status);
  const isReserved = table.status === 'reserved';
  const isGroup = groupNumber && mergedChildNumbers && mergedChildNumbers.length > 0 && !isMergedChild;

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

  return (
    <div
      onClick={onTap}
      className={`relative h-[180px] rounded-[24px] p-5 text-left transition-all duration-200 group overflow-hidden border cursor-pointer
        ${isTransferSource
          ? (lightMode ? 'bg-zinc-100 border-transparent opacity-60' : 'bg-zinc-800/50 border-transparent opacity-50')
          : isTransferTarget
            ? (lightMode ? 'bg-white border-zinc-400 border-dashed animate-pulse' : 'bg-zinc-900 border-zinc-400 border-dashed animate-pulse')
            : isSelected 
              ? (lightMode ? 'bg-white border-blue-500 shadow-lg' : 'bg-zinc-900 border-blue-500 shadow-lg') 
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
      <span className={`absolute top-5 left-5 text-4xl font-black tracking-tighter transition-colors flex items-start gap-1.5
        ${isSelected ? (lightMode ? 'text-zinc-900' : 'text-white') : isReserved ? (lightMode ? 'text-indigo-600' : 'text-indigo-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
        {table.table_number}
        {isGroup && (
          <span className={`mt-1.5 px-1.5 py-0.5 rounded-md text-[8px] font-black leading-none uppercase tracking-tight ${
            lightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'
          }`}>
            {t('group_label')} {groupNumber}
          </span>
        )}
      </span>

      {isReserved && (
        <div className="absolute top-[68px] left-5 right-5 flex flex-col gap-0.5">
          <span className={`text-base font-bold truncate leading-tight ${lightMode ? 'text-indigo-950' : 'text-white'}`}>
            {table.reservation_name || table.reservation_phone || table.table_number}
          </span>
          <div className="flex items-center gap-3 opacity-60">
            {table.reservation_time && (
              <div className="flex items-center gap-1">
                <Clock size={11} className="text-indigo-400" />
                <span className="text-[11px] font-bold tabular-nums">{table.reservation_time}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users size={11} className="text-indigo-400" />
              <span className="text-[11px] font-bold tabular-nums">{table.guest_count}</span>
            </div>
          </div>
        </div>
      )}

      {!isReserved && (isOccupied || (table.guest_count ?? 0) > 0 || isGroup) && (
        <div className="absolute top-[68px] left-5 flex flex-col gap-1">
          { (table.guest_count ?? 0) > 0 && (
            <div className="flex items-center gap-1 opacity-60">
              <Users size={11} className={lightMode ? 'text-zinc-600' : 'text-zinc-400'} />
              <span className={`text-[11px] font-bold ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{table.guest_count}</span>
            </div>
          )}
          {delaySec > 0 && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-black tabular-nums
              ${delaySec > 1200 ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-white/5 border-white/5 text-white/40'}`}>
              <Clock size={9} strokeWidth={3} />
              {formatDelay(delaySec)}
            </div>
          )}
        </div>
      )}

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

      <div className="absolute top-4 right-4">
        {selectionMode ? (
          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
            isSelected ? 'bg-blue-500 border-blue-500' : (lightMode ? 'bg-zinc-100 border-zinc-300' : 'bg-white/5 border-white/10')
          }`}>
            <AnimatePresence>{isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={14} className="text-white" strokeWidth={3} /></motion.div>}</AnimatePresence>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onAction(); }} className="p-1.5 rounded-full transition-colors hover:bg-white/10">
            <MoreVertical size={16} className="text-white/20 group-hover:text-white/40" />
          </button>
        )}
      </div>

      <div className="absolute bottom-4 left-0 right-0 px-5 flex items-center justify-between">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest
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
            <p className={`text-base font-black ${lightMode ? 'text-emerald-600' : 'text-emerald-500'}`}>₼{table.total_amount.toFixed(2)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
