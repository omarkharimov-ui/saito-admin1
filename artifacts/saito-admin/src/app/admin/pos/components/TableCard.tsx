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
      whileTap={{ scale: 0.96 }}
      onClick={onTap}
      className={`relative h-[130px] rounded-[24px] p-5 text-left transition-all duration-300 shadow-sm hover:shadow-md group overflow-hidden border
        ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50 border-emerald-200' : 
          isTransferSource ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-200' :
          isTransferTarget ? 'ring-2 ring-gold bg-gold/5 border-gold/20' :
          'bg-[#f4f4f7] dark:bg-white/[0.08] hover:bg-[#ebebef] dark:hover:bg-white/[0.12] border-black/[0.05] dark:border-white/[0.05]'}`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className={`text-2xl font-black ${lightMode ? 'text-gray-900' : 'text-white'}`}>
          {table.table_number}
        </span>
        <button 
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <MoreVertical size={18} className={lightMode ? 'text-gray-400' : 'text-white/40'} />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
           <div className={`w-1.5 h-1.5 rounded-full ${
             table.status === 'occupied' ? 'bg-emerald-500' : 
             table.status === 'dirty' ? 'bg-orange-500' : 
             table.status === 'reserved' ? 'bg-blue-500' : 
             'bg-zinc-400'
           }`} />
           <span className={`text-[10px] font-black uppercase tracking-widest ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>
             {table.status === 'occupied' ? t('occupied' as any) : 
              table.status === 'dirty' ? 'dirty' : 
              table.status === 'reserved' ? 'reserved' : 
              t('empty' as any)}
           </span>
        </div>
        {table.total_amount > 0 && (
          <p className="text-sm font-black text-emerald-600 mt-1">₼{table.total_amount.toFixed(2)}</p>
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
