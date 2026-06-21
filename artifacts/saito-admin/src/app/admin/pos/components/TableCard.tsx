'use client';

import { motion } from 'framer-motion';
import { MoreVertical, AlertTriangle } from 'lucide-react';
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
    <div
      onClick={onTap}
      className={`relative h-[180px] rounded-[32px] p-6 text-left transition-all duration-300 group overflow-hidden border-2 cursor-pointer
        ${isSelected 
          ? (lightMode ? 'bg-white border-emerald-500 shadow-[0_20px_40px_rgba(16,185,129,0.1)]' : 'bg-zinc-900 border-emerald-500 shadow-[0_20px_40px_rgba(16,185,129,0.2)]') 
          : isOverdue 
            ? 'border-rose-500 bg-rose-500/5 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
            : isOccupied
              ? (lightMode ? 'bg-white border-emerald-500/60 shadow-sm' : 'bg-zinc-900 border-emerald-500/60 shadow-md')
              : (lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900 border-white/10 shadow-sm')
        }
        ${isTransferSource ? 'border-blue-500 bg-blue-500/5' : ''}
        ${isTransferTarget ? 'border-zinc-400 border-dashed' : ''}`}
    >
      {/* Table Number - Top Left */}
      <span className={`absolute top-6 left-6 text-5xl font-black tracking-tighter transition-colors ${isSelected || isTransferSource ? (lightMode ? 'text-emerald-600' : 'text-emerald-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
        {table.table_number}
      </span>

      {/* Action Button - Top Right */}
      <div className="absolute top-4 right-4">
        <button 
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          className={`p-2 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10`}
        >
          <MoreVertical size={20} className={isSelected || isTransferSource ? (lightMode ? 'text-emerald-600/40' : 'text-emerald-400/40') : (lightMode ? 'text-gray-400' : 'text-white/40')} />
        </button>
      </div>

      {/* Delay Badge - Specific position to prevent layout shifts */}
      {isOverdue && (
        <div className="absolute top-14 right-6">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle size={12} className="text-rose-500 animate-pulse" />
            <span className="text-[8px] font-black text-rose-600 uppercase tracking-tighter">Gecikmə</span>
          </motion.div>
        </div>
      )}

      {/* Status Badge - Fixed Center Position */}
      <div className="absolute top-[100px] left-0 right-0 flex justify-center">
        <div className={`flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-full border border-black/5 dark:border-white/5 shadow-sm`}>
           <div className={`w-2 h-2 rounded-full ${
             isOccupied ? 'bg-emerald-500' : 
             table.status === 'dirty' ? 'bg-orange-500' : 
             table.status === 'reserved' ? 'bg-blue-500' : 
             'bg-zinc-400'
           }`} />
           <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>
             {isOccupied ? t('occupied' as any) : 
              table.status === 'dirty' ? 'dirty' : 
              table.status === 'reserved' ? 'reserved' : 
              t('empty' as any)}
           </span>
        </div>
      </div>

      {/* Price - Bottom Left */}
      <div className="absolute bottom-6 left-6">
        {table.total_amount > 0 && (
          <p className={`text-xl font-black ${lightMode ? 'text-emerald-600' : 'text-emerald-500'}`}>₼{table.total_amount.toFixed(2)}</p>
        )}
      </div>
    </div>
  );
}
