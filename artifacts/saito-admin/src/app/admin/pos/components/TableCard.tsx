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

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onTap}
      className={`relative h-[180px] rounded-[32px] p-6 text-left transition-all duration-300 group overflow-hidden border-2
        ${isSelected ? (lightMode ? 'bg-zinc-900 border-zinc-900 shadow-[0_20px_40px_rgba(0,0,0,0.2)]' : 'bg-white border-white shadow-xl') : 
          isTransferSource ? (lightMode ? 'bg-zinc-900 border-zinc-900 shadow-lg' : 'bg-white border-white shadow-lg') :
          isTransferTarget ? (lightMode ? 'bg-zinc-50 border-zinc-900 border-dashed shadow-lg' : 'bg-zinc-900 border-white border-dashed shadow-lg') :
          lightMode 
            ? 'bg-white border-zinc-200 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-zinc-300' 
            : 'bg-white/[0.05] border-white/[0.1] hover:bg-white/[0.08] hover:border-white/[0.2]'}`}
    >
      <div className="flex justify-between items-start mb-4">
        <span className={`text-4xl font-black tracking-tighter ${isSelected || isTransferSource ? (lightMode ? 'text-white' : 'text-black') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
          {table.table_number}
        </span>
        <button 
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          className={`p-1.5 rounded-full transition-colors ${isSelected || isTransferSource ? 'hover:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
        >
          <MoreVertical size={18} className={isSelected || isTransferSource ? (lightMode ? 'text-white/40' : 'text-black/40') : (lightMode ? 'text-gray-400' : 'text-white/40')} />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
           <div className={`w-1.5 h-1.5 rounded-full ${
             table.status === 'occupied' ? (isSelected || isTransferSource ? 'bg-emerald-400' : 'bg-emerald-500') : 
             table.status === 'dirty' ? 'bg-orange-500' : 
             table.status === 'reserved' ? 'bg-blue-500' : 
             (isSelected || isTransferSource ? 'bg-white/30' : 'bg-zinc-400')
           }`} />
           <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected || isTransferSource ? (lightMode ? 'text-white/60' : 'text-black/60') : (lightMode ? 'text-gray-500' : 'text-white/40')}`}>
             {table.status === 'occupied' ? t('occupied' as any) : 
              table.status === 'dirty' ? 'dirty' : 
              table.status === 'reserved' ? 'reserved' : 
              t('empty' as any)}
           </span>
        </div>
        {table.total_amount > 0 && (
          <p className={`text-sm font-black mt-1 ${isSelected || isTransferSource ? (lightMode ? 'text-emerald-400' : 'text-emerald-700') : 'text-emerald-600'}`}>₼{table.total_amount.toFixed(2)}</p>
        )}
      </div>

      {isOverdue && (
        <div className="absolute top-2 right-10">
          <AlertTriangle size={14} className="text-orange-500 animate-pulse" />
        </div>
      )}
    </motion.button>
  );
}
