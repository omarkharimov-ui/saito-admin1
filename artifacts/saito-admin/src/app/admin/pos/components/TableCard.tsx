'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, AlertTriangle, Users, Check, Clock } from 'lucide-react';
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
}

export function TableCard({ table, onTap, onAction, isSelected, selectionMode, isTransferSource, isTransferTarget, isOverdue, overdueType, index = 0 }: TableCardProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  const isReserved = table.status === 'reserved' || (table as any).is_draft || table.kitchen_status === 'reserved' || (table.has_pending && table.status === 'reserved');
  const isOccupied = (table.status === 'occupied' || table.total_amount > 0) && !isReserved;

  return (
    <div
      onClick={onTap}
      className={`relative h-[180px] rounded-[32px] p-6 text-left transition-all duration-300 group overflow-hidden border-2 cursor-pointer
        ${isSelected 
          ? (lightMode ? 'bg-white border-blue-500 shadow-[0_20px_40px_rgba(59,130,246,0.1)] scale-[1.02]' : 'bg-zinc-900 border-blue-500 shadow-[0_20px_40px_rgba(59,130,246,0.2)] scale-[1.02]') 
          : isReserved
            ? (lightMode ? 'bg-indigo-50/50 border-indigo-200' : 'bg-indigo-500/5 border-indigo-500/30')
            : isOverdue 
              ? (lightMode ? 'bg-white border-rose-500 shadow-sm' : 'bg-zinc-900 border-rose-500 shadow-md')
              : isOccupied
                ? (lightMode ? 'bg-white border-emerald-500 shadow-sm' : 'bg-zinc-900 border-emerald-500/60 shadow-md')
                : (lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900 border-white/10 shadow-sm')
        }
        ${isTransferSource ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : ''}
        ${isTransferTarget ? 'border-zinc-400 border-dashed animate-pulse' : ''}`}
    >
      {/* 1. PRIMARY: Table Identifier */}
      <span className={`absolute top-6 left-6 text-5xl font-black tracking-tighter transition-colors 
        ${isSelected || isReserved ? (lightMode ? 'text-indigo-600' : 'text-indigo-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
        {table.table_number}
      </span>

      {/* 2. SECONDARY & TERTIARY: Reservation Identity */}
      {isReserved && (
        <div className="absolute top-[76px] left-6 right-6 flex flex-col gap-0.5">
          <span className={`text-lg font-bold truncate leading-tight ${lightMode ? 'text-indigo-950' : 'text-white'}`}>
            {table.reservation_name || table.reservation_phone || (table.reservation_id ? `ID: ${table.reservation_id.slice(0, 8)}` : (lightMode ? 'Adsız Rezerv' : 'No Name'))}
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

      {/* Standard Occupied Metadata (Fallback) */}
      {!isReserved && isOccupied && (table.guest_count ?? 0) > 0 && (
        <div className="absolute top-[72px] left-6 flex items-center gap-1 opacity-60">
          <Users size={12} className={lightMode ? 'text-zinc-600' : 'text-zinc-400'} />
          <span className={`text-xs font-bold ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{table.guest_count}</span>
        </div>
      )}

      {/* 3. ACTION ICON */}
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

      {/* 4. QUATERNARY: Lifecycle Status (Bottom Anchored) */}
      <div className="absolute bottom-4 left-0 right-0 px-6 flex items-center justify-between">
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest
          ${isReserved 
            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' 
            : isOccupied 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
              : 'bg-white/5 border-white/5 text-white/30'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isReserved ? 'bg-indigo-400' : isOccupied ? 'bg-emerald-500' : 'bg-white/20'}`} />
          {isReserved ? 'Reserved' : isOccupied ? t('occupied' as any) : t('empty' as any)}
        </div>

        {/* Dynamic Context (Price or Phone) */}
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
