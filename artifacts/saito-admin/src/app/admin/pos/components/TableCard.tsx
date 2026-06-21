'use client';

import { motion } from 'framer-motion';
import { Clock, Users, Utensils, MoreVertical, GitMerge, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosTable } from '../types/shared';

interface TableCardProps {
  table: PosTable;
  onTap: () => void;
  onAction: () => void;
  isSelected?: boolean;
  isTransferSource?: boolean;
  isTransferTarget?: boolean;
  isOverdue?: boolean;
}

export function TableCard({ table, onTap, onAction, isSelected, isTransferSource, isTransferTarget, isOverdue }: TableCardProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  const isOccupied = table.status === 'occupied' || table.total_amount > 0;

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onTap}
      className={`relative h-[180px] rounded-[32px] p-6 text-left transition-all duration-300 group overflow-hidden border-2
        ${isSelected ? (lightMode ? 'bg-black border-black shadow-[0_20px_40px_rgba(0,0,0,0.3)] scale-[1.02]' : 'bg-white border-white shadow-[0_20px_40px_rgba(255,255,255,0.1)] scale-[1.02]') : 
          isTransferSource ? (lightMode ? 'bg-zinc-800 border-zinc-800 shadow-lg' : 'bg-zinc-100 border-zinc-100 shadow-lg') :
          isTransferTarget ? (lightMode ? 'bg-zinc-50 border-zinc-400 border-dashed shadow-md' : 'bg-white/5 border-white/20 border-dashed shadow-md') :
          isOccupied
            ? lightMode ? 'bg-zinc-50 border-zinc-200 shadow-sm' : 'bg-white/[0.08] border-white/[0.1] shadow-md'
            : lightMode ? 'bg-white border-zinc-100 opacity-60' : 'bg-white/[0.03] border-white/[0.05] opacity-40'}
        hover:opacity-100 hover:scale-[1.01] hover:border-zinc-300 dark:hover:border-white/20`}
    >
      <div className="flex justify-between items-start mb-1">
        <span className={`text-5xl font-black tracking-tighter transition-colors ${isSelected || isTransferSource ? (lightMode ? 'text-white' : 'text-black') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
          {table.table_number}
        </span>
        <div className="flex flex-col items-end gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onAction(); }}
            className={`p-2 rounded-full transition-colors ${isSelected || isTransferSource ? 'hover:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
          >
            <MoreVertical size={20} className={isSelected || isTransferSource ? (lightMode ? 'text-white/40' : 'text-black/40') : (lightMode ? 'text-gray-400' : 'text-white/40')} />
          </button>
          {isOverdue && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <AlertTriangle size={12} className="text-orange-500 animate-pulse" />
              <span className="text-[9px] font-black text-orange-600 uppercase tracking-tighter">Gecikmə</span>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-2">
        <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-full border border-black/5 dark:border-white/5">
           <div className={`w-2 h-2 rounded-full ${
             isOccupied ? (isSelected || isTransferSource ? 'bg-emerald-400' : 'bg-emerald-500') : 
             table.status === 'dirty' ? 'bg-orange-500' : 
             table.status === 'reserved' ? 'bg-blue-500' : 
             (isSelected || isTransferSource ? (lightMode ? 'bg-white/20' : 'bg-black/20') : 'bg-zinc-400')
           }`} />
           <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isSelected || isTransferSource ? (lightMode ? 'text-white' : 'text-black') : (lightMode ? 'text-gray-500' : 'text-white/60')}`}>
             {isOccupied ? t('occupied' as any) : 
              table.status === 'dirty' ? 'dirty' : 
              table.status === 'reserved' ? 'reserved' : 
              t('empty' as any)}
           </span>
        </div>
      </div>

      <div className="mt-auto">
        {table.total_amount > 0 && (
          <p className={`text-xl font-black mt-2 ${isSelected || isTransferSource ? (lightMode ? 'text-emerald-300' : 'text-emerald-400') : 'text-emerald-600'}`}>₼{table.total_amount.toFixed(2)}</p>
        )}
      </div>
    </motion.button>
  );
}
