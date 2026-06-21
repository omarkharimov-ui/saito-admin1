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
        ${isSelected ? 'ring-4 ring-emerald-500/20 bg-emerald-50 border-emerald-500 shadow-lg' : 
          isTransferSource ? 'ring-4 ring-blue-500/20 bg-blue-50 border-blue-500 shadow-lg' :
          isTransferTarget ? 'ring-4 ring-amber-500/20 bg-amber-50 border-amber-500 shadow-lg' :
          lightMode 
            ? 'bg-white border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-gray-200' 
            : 'bg-white/[0.05] border-white/[0.05] hover:bg-white/[0.08] hover:border-white/[0.1]'}`}
    >
      <div className="flex justify-between items-start mb-4">
        <span className={`text-4xl font-black tracking-tighter ${lightMode ? 'text-gray-900' : 'text-white'}`}>
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
