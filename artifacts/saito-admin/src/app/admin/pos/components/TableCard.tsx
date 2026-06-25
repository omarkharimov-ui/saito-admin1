'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, AlertTriangle, Users, Check } from 'lucide-react';
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
            ? (lightMode ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-indigo-500/10 border-indigo-500 shadow-md')
            : isOverdue 
              ? (lightMode ? 'bg-white border-rose-500 shadow-sm' : 'bg-zinc-900 border-rose-500 shadow-md')
              : isOccupied
                ? (lightMode ? 'bg-white border-emerald-500 shadow-sm' : 'bg-zinc-900 border-emerald-500/60 shadow-md')
                : (lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900 border-white/10 shadow-sm')
        }
        ${isTransferSource ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : ''}
        ${isTransferTarget ? 'border-zinc-400 border-dashed animate-pulse' : ''}`}
    >
      <div>
        {/* Table Number - Top Left */}
        <span className={`absolute top-6 left-6 text-5xl font-black tracking-tighter transition-colors ${isSelected || isTransferSource || isReserved ? (lightMode ? 'text-indigo-600' : 'text-indigo-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
          {table.table_number}
        </span>

        {/* Reservation Info */}
        {isReserved && (
          <div className="absolute top-[70px] left-6 flex flex-col">
            <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-0.5">BRON EDİLİB</span>
            <span className="text-sm font-black text-[var(--theme-text)] truncate max-w-[120px] leading-tight">{table.reservation_name}</span>
            <span className="text-[10px] font-bold opacity-60 mt-0.5">{table.reservation_time}</span>
          </div>
        )}

        {/* Guest Count - Below Table Number */}
        {isOccupied && (table.guest_count ?? 0) > 0 && (
          <div className="absolute top-[72px] left-6 flex items-center gap-1 opacity-60">
            <Users size={12} className={lightMode ? 'text-zinc-600' : 'text-zinc-400'} />
            <span className={`text-xs font-bold ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{table.guest_count}</span>
          </div>
        )}
      </div>

      {/* Action Button / Selection Tick - Top Right */}
      <div className="absolute top-4 right-4">
        {selectionMode ? (
          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
            isSelected 
              ? 'bg-blue-500 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' 
              : (lightMode ? 'bg-zinc-100 border-zinc-300' : 'bg-white/5 border-white/10')
          }`}>
            <AnimatePresence>
              {isSelected && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Check size={18} className="text-white" strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); onAction(); }}
            className={`p-2 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10`}
          >
            <MoreVertical size={20} className={isSelected || isTransferSource ? (lightMode ? 'text-emerald-600/40' : 'text-emerald-400/40') : (lightMode ? 'text-gray-400' : 'text-white/40')} />
          </button>
        )}
      </div>

      {/* Delay Badge */}
      {isOverdue && (
        <div className="absolute top-14 right-6">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <AlertTriangle size={12} className="text-rose-500 animate-pulse" />
              <span className="text-[8px] font-black text-rose-600 uppercase tracking-tighter">
                {overdueType === 'not_accepted' ? 'Qəbul Gözləyir' : 'Hazırlanma Gecikir'}
              </span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Status Badge */}
      <div className="absolute top-[92px] left-0 right-0 flex justify-center">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm ${
          lightMode ? 'bg-[#efeff4] border-zinc-200' : 'bg-black/5 border-black/5 dark:bg-white/5 dark:border-white/5'
        }`}>
            <div className={`w-2 h-2 rounded-full ${
              isOccupied ? 'bg-emerald-500' : 
              table.status === 'dirty' ? 'bg-orange-500' : 
              isReserved ? 'bg-indigo-500' : 
              lightMode ? 'bg-zinc-400' : 'bg-zinc-400'
            }`} />
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
              {isOccupied ? t('occupied' as any) : 
               table.status === 'dirty' ? 'dirty' : 
               isReserved ? 'reserved' : 
               t('empty' as any)}
            </span>

        </div>
      </div>

      {/* Price */}
      <div className="absolute bottom-6 left-6">
        {!isReserved && table.total_amount > 0 && (
          <p className={`text-xl font-black ${lightMode ? 'text-emerald-600' : 'text-emerald-500'}`}>₼{table.total_amount.toFixed(2)}</p>
        )}
      </div>
    </div>
  );
}
