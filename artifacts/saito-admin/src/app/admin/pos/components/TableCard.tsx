'use client';

import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { MoreVertical, AlertTriangle, Users } from 'lucide-react';
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
  overdueType?: 'not_accepted' | 'preparing';
  index?: number;
}

export function TableCard({ table, onTap, onAction, isSelected, isTransferSource, isTransferTarget, isOverdue, overdueType, index = 0 }: TableCardProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  // 3D Tilt Values
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const isOccupied = table.status === 'occupied' || table.total_amount > 0;

  return (
    <motion.div
      onClick={onTap}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, scale: 0.8, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ 
        type: 'spring', 
        stiffness: 260, 
        damping: 20,
        delay: index * 0.05 
      }}
      className={`relative h-[180px] rounded-[32px] p-6 text-left transition-all duration-300 group overflow-hidden border-2 cursor-pointer
        ${isSelected 
          ? (lightMode ? 'bg-white border-emerald-500 shadow-[0_20px_40px_rgba(16,185,129,0.1)]' : 'bg-zinc-900 border-emerald-500 shadow-[0_20px_40px_rgba(16,185,129,0.2)]') 
          : isOverdue 
            ? (lightMode ? 'bg-white border-rose-500 shadow-sm' : 'bg-zinc-900 border-rose-500 shadow-md')
            : isOccupied
              ? (lightMode ? 'bg-white border-emerald-500 shadow-sm' : 'bg-zinc-900 border-emerald-500/60 shadow-md')
              : (lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900 border-white/10 shadow-sm')
        }
        ${isTransferSource ? 'border-blue-500 bg-blue-500/5' : ''}
        ${isTransferTarget ? 'border-zinc-400 border-dashed' : ''}`}
    >
      <div style={{ transform: "translateZ(50px)" }}>
        {/* Table Number - Top Left */}
        <span className={`absolute top-6 left-6 text-5xl font-black tracking-tighter transition-colors ${isSelected || isTransferSource ? (lightMode ? 'text-emerald-600' : 'text-emerald-400') : (lightMode ? 'text-gray-900' : 'text-white')}`}>
          {table.table_number}
        </span>

        {/* Guest Count - Below Table Number */}
        {isOccupied && table.guest_count > 0 && (
          <div className="absolute top-[72px] left-6 flex items-center gap-1 opacity-60">
            <Users size={12} className={lightMode ? 'text-zinc-600' : 'text-zinc-400'} />
            <span className={`text-xs font-bold ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{table.guest_count}</span>
          </div>
        )}
      </div>

      {/* Action Button - Top Right */}
      <div className="absolute top-4 right-4" style={{ transform: "translateZ(40px)" }}>
        <button 
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          className={`p-2 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10`}
        >
          <MoreVertical size={20} className={isSelected || isTransferSource ? (lightMode ? 'text-emerald-600/40' : 'text-emerald-400/40') : (lightMode ? 'text-gray-400' : 'text-white/40')} />
        </button>
      </div>

      {/* Delay Badge - Specific position to prevent layout shifts */}
      {isOverdue && (
        <div className="absolute top-14 right-6" style={{ transform: "translateZ(60px)" }}>
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

      {/* Status Badge - Fixed Center Position */}
      <div className="absolute top-[92px] left-0 right-0 flex justify-center" style={{ transform: "translateZ(30px)" }}>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm ${
          lightMode ? 'bg-[#efeff4] border-zinc-200' : 'bg-black/5 border-black/5 dark:bg-white/5 dark:border-white/5'
        }`}>
           <div className={`w-2 h-2 rounded-full ${
             isOccupied ? 'bg-emerald-500' : 
             table.status === 'dirty' ? 'bg-orange-500' : 
             table.status === 'reserved' ? 'bg-blue-500' : 
             lightMode ? 'bg-zinc-400' : 'bg-zinc-400'
           }`} />
           <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
             {isOccupied ? t('occupied' as any) : 
              table.status === 'dirty' ? 'dirty' : 
              table.status === 'reserved' ? 'reserved' : 
              t('empty' as any)}
           </span>
        </div>
      </div>

      {/* Price - Bottom Left */}
      <div className="absolute bottom-6 left-6" style={{ transform: "translateZ(70px)" }}>
        {table.total_amount > 0 && (
          <p className={`text-xl font-black ${lightMode ? 'text-emerald-600' : 'text-emerald-500'}`}>₼{table.total_amount.toFixed(2)}</p>
        )}
      </div>
    </motion.div>
  );
}
        </div>
      )}

      {/* Status Badge - Fixed Center Position */}
      <div className="absolute top-[92px] left-0 right-0 flex justify-center">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm ${
          lightMode ? 'bg-[#efeff4] border-zinc-200' : 'bg-black/5 border-black/5 dark:bg-white/5 dark:border-white/5'
        }`}>
           <div className={`w-2 h-2 rounded-full ${
             isOccupied ? 'bg-emerald-500' : 
             table.status === 'dirty' ? 'bg-orange-500' : 
             table.status === 'reserved' ? 'bg-blue-500' : 
             lightMode ? 'bg-zinc-400' : 'bg-zinc-400'
           }`} />
           <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
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
    </motion.div>
  );
}
