'use client';

import { motion } from 'framer-motion';
import { Clock, Users, Utensils, MoreVertical, GitMerge } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosTable } from '../types';

const statusConfig: Record<string, { label: string; dot: string; bg: string; border: string; text: string; glow: string; lightBg: string; lightBorder: string; lightText: string }> = {
  empty: {
    label: 'Boş', dot: 'bg-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20',
    text: 'text-emerald-300', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.08)]',
    lightBg: 'bg-emerald-50/70', lightBorder: 'border-emerald-200', lightText: 'text-emerald-700',
  },
  active: {
    label: 'Aktiv', dot: 'bg-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/20',
    text: 'text-blue-300', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.08)]',
    lightBg: 'bg-blue-50/70', lightBorder: 'border-blue-200', lightText: 'text-blue-700',
  },
  waiting_bill: {
    label: 'Hesab', dot: 'bg-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/25',
    text: 'text-amber-300', glow: 'shadow-[0_0_25px_rgba(251,191,36,0.12)]',
    lightBg: 'bg-amber-50/70', lightBorder: 'border-amber-200', lightText: 'text-amber-700',
  },
  cooking: {
    label: 'Mətbəx', dot: 'bg-violet-400', bg: 'bg-violet-500/5', border: 'border-violet-500/20',
    text: 'text-violet-300', glow: 'shadow-[0_0_20px_rgba(167,139,250,0.08)]',
    lightBg: 'bg-violet-50/70', lightBorder: 'border-violet-200', lightText: 'text-violet-700',
  },
  problem: {
    label: 'Problem', dot: 'bg-red-400', bg: 'bg-red-500/5', border: 'border-red-500/25',
    text: 'text-red-300', glow: 'shadow-[0_0_25px_rgba(248,113,113,0.12)]',
    lightBg: 'bg-red-50/70', lightBorder: 'border-red-200', lightText: 'text-red-700',
  },
};

function timeSince(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}d`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}s ${mins % 60}d`;
}

export function TableCard({
  table, onTap, onAction, isSelected, isTransferSource,
}: {
  table: PosTable;
  onTap: () => void;
  onAction?: () => void;
  isSelected: boolean;
  isTransferSource?: boolean;
}) {
  const { lightMode } = useTheme();
  const cfg = statusConfig[table.status] || statusConfig.empty;
  const isOccupied = table.status !== 'empty';

  return (
    <motion.button
      layout
      whileHover={{ y: -2, transition: { duration: 0.12 } }}
      whileTap={{ scale: 0.95 }}
      onClick={onTap}
      className={`relative flex flex-col rounded-2xl border p-3.5 text-left transition-all ${lightMode ? cfg.lightBg : cfg.bg} ${lightMode ? cfg.lightBorder : cfg.border} ${isSelected ? (lightMode ? 'ring-2 ring-gray-900/20 shadow-md' : 'ring-2 ring-white/30 shadow-xl') : ''} ${isTransferSource ? 'ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/10' : ''} ${lightMode ? 'shadow-sm hover:shadow-md' : cfg.glow}`}
    >
      {/* Pulse for waiting */}
      {table.status === 'waiting_bill' && (
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className={`absolute inset-0 rounded-2xl pointer-events-none ${lightMode ? 'bg-amber-100/50' : 'bg-amber-400/5'}`}
        />
      )}

      {/* Header row: number + status + 3-dot */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base font-black ${isSelected ? (lightMode ? 'bg-gray-900 text-white' : 'bg-white/20 text-white') : lightMode ? 'bg-white/80 text-gray-700 shadow-sm' : 'bg-white/[0.06] text-white/70'}`}>
            {table.table_number}
          </div>
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${lightMode ? cfg.lightText : cfg.text} ${lightMode ? 'bg-white/60' : cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
        {/* Merge indicator */}
        {table.merged_orders && table.merged_orders.length > 0 && (
          <div className={`flex items-center gap-0.5 ${lightMode ? 'text-amber-600/70' : 'text-amber-400/70'}`}>
            <GitMerge size={12} />
            <span className="text-[9px] font-bold tabular-nums">{table.merged_orders.length}</span>
          </div>
        )}
        {onAction && (
          <span
            onClick={e => { e.stopPropagation(); onAction(); }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]`}
          >
            <MoreVertical size={14} />
          </span>
        )}
      </div>

      {/* Info */}
      {isOccupied && (
        <div className="space-y-1.5 mt-0.5">
          <div className={`flex items-center gap-2.5 ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>
            <div className="flex items-center gap-1.5">
              <Users size={11} />
              <span className="text-[11px] font-medium tabular-nums">{table.guest_count}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={11} />
              <span className="text-[11px] font-medium tabular-nums">{timeSince(table.opened_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Utensils size={11} />
              <span className="text-[11px] font-medium tabular-nums">{table.order_count}</span>
            </div>
          </div>
          <div className={`text-sm font-black tabular-nums ${lightMode ? 'text-amber-700' : 'text-gold'}`}>{table.total_amount.toFixed(2)} ₼</div>
        </div>
      )}

      {/* Empty state */}
      {!isOccupied && (
        <div className="py-2.5 flex items-center justify-center">
          <span className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${lightMode ? 'text-gray-400' : 'text-white/15'}`}>Boş</span>
        </div>
      )}
    </motion.button>
  );
}
