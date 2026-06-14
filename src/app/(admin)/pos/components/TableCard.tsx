'use client';

import { motion } from 'framer-motion';
import { Clock, Users, Utensils, MoreVertical, GitMerge, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosTable } from '../types/shared';

const statusConfig: Record<string, { label: string; dot: string; bg: string; border: string; text: string; glow: string; lightBg: string; lightBorder: string; lightText: string }> = {
  empty: {
    label: 'BOŞ', dot: 'bg-zinc-500', bg: 'bg-[#101012]', border: 'border-zinc-800',
    text: 'text-zinc-400', glow: '',
    lightBg: 'bg-zinc-50', lightBorder: 'border-zinc-200', lightText: 'text-zinc-400',
  },
  active: {
    label: 'Aktiv', dot: 'bg-blue-400', bg: 'bg-[#182036] backdrop-blur-md', border: 'border-blue-500/40',
    text: 'text-blue-400', glow: 'shadow-[0_0_30px_rgba(59,130,246,0.12)]',
    lightBg: 'bg-blue-50/70', lightBorder: 'border-blue-200', lightText: 'text-blue-700',
  },
  waiting_bill: {
    label: 'Hesab', dot: 'bg-amber-400', bg: 'bg-[#261b10] backdrop-blur-md', border: 'border-amber-500/40',
    text: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.15)]',
    lightBg: 'bg-amber-50/70', lightBorder: 'border-amber-200', lightText: 'text-amber-700',
  },
  cooking: {
    label: 'Mətbəx', dot: 'bg-violet-400', bg: 'bg-[#1e1536] backdrop-blur-md', border: 'border-violet-500/35',
    text: 'text-violet-400', glow: 'shadow-[0_0_30px_rgba(167,139,250,0.12)]',
    lightBg: 'bg-violet-50/70', lightBorder: 'border-violet-200', lightText: 'text-violet-700',
  },
  merged: {
    label: 'Birləşdi', dot: 'bg-zinc-400', bg: 'bg-zinc-900 backdrop-blur-md', border: 'border-zinc-700/40',
    text: 'text-zinc-400', glow: 'shadow-[0_0_20px_rgba(161,161,170,0.08)]',
    lightBg: 'bg-zinc-100/80', lightBorder: 'border-zinc-300', lightText: 'text-zinc-600',
  },
  problem: {
    label: 'Problem', dot: 'bg-red-400', bg: 'bg-[#2e0f0f] backdrop-blur-md', border: 'border-red-500/40',
    text: 'text-red-400', glow: 'shadow-[0_0_30px_rgba(248,113,113,0.12)]',
    lightBg: 'bg-red-50/70', lightBorder: 'border-red-200', lightText: 'text-red-700',
  },
};

function timeSince(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}d`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}s ${mins % 60}d`;
}

export function TableCard({
  table, onTap, onAction, isSelected, isTransferSource, isOverdue,
}: {
  table: PosTable;
  onTap: () => void;
  onAction?: () => void;
  isSelected: boolean;
  isTransferSource?: boolean;
  isOverdue?: boolean;
}) {
  const { lightMode } = useTheme();
  const cfg = statusConfig[table.status] || statusConfig.empty;
  const isOccupied = table.status !== 'empty';
  const isMerged = table.status === 'merged';

  const mergedChildNumbers: number[] = (table.merged_orders as any[])?.map(m => m.table_number) ?? [];
  const hasMergedChildren = mergedChildNumbers.length > 0;
  const isGroupParent = hasMergedChildren;

  const allMergedNumbers = isGroupParent
    ? [table.table_number, ...mergedChildNumbers]
    : [];

  return (
    <motion.button
      layout
      whileHover={{ y: -2, transition: { duration: 0.12 } }}
      whileTap={{ scale: 0.95 }}
      onClick={onTap}
      className={`relative w-full flex flex-col rounded-2xl p-4 text-left transition-all duration-200 border ${lightMode ? cfg.lightBg : cfg.bg} ${lightMode ? (isGroupParent ? 'border-zinc-300' : cfg.lightBorder) : (isGroupParent ? 'border-zinc-700' : cfg.border)} ${isSelected ? (lightMode ? 'ring-2 ring-gray-900/20 shadow-md' : 'ring-2 ring-white/25 shadow-xl') : ''} ${isTransferSource ? 'ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/10' : ''} ${lightMode ? 'shadow-sm hover:shadow-md' : cfg.glow} ${isMerged ? 'border-l-2 border-l-zinc-500/40' : ''} ${isOverdue ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : ''}`}
    >
      {/* Static subtle glow for waiting bill — no pulse */}
      {table.status === 'waiting_bill' && (
        <span className={`absolute inset-0 rounded-2xl pointer-events-none ${lightMode ? 'bg-amber-100/40' : 'bg-amber-400/[0.04]'}`} />
      )}

      {/* Overdue pending pulse */}
      {isOverdue && (
        <span className="absolute inset-0 rounded-2xl pointer-events-none ring-2 ring-red-500/40 animate-pulse" />
      )}

      {/* Header row: number + status + merge indicator */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base font-black ${isSelected ? (lightMode ? 'bg-gray-900 text-white' : 'bg-white/20 text-white') : isMerged ? (lightMode ? 'bg-zinc-300 text-zinc-600' : 'bg-zinc-700/60 text-zinc-200') : table.status === 'empty' ? (lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/[0.04] text-white/60') : lightMode ? 'bg-white/80 text-gray-700 shadow-sm' : 'bg-white/[0.06] text-white/80'}`}>
            {isGroupParent ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="text-[6px] font-bold uppercase tracking-wider">Qrup</span>
                <span className="text-[13px] font-black -mt-0.5">{table.table_number}</span>
              </span>
            ) : (
              table.table_number
            )}
          </div>
          <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-[0.18em] ${lightMode ? cfg.lightText : cfg.text} ${lightMode ? 'bg-white/70' : (table.status === 'empty' ? 'bg-white/[0.04]' : 'bg-black/20')}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isGroupParent && (
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${lightMode ? 'bg-zinc-200/60 text-zinc-500' : 'bg-zinc-800/50 text-zinc-400'}`}>
              <GitMerge size={12} />
            </span>
          )}
          {onAction && !isMerged && (
            <span
              onClick={e => { e.stopPropagation(); onAction(); }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]`}
            >
              <MoreVertical size={14} />
            </span>
          )}
        </div>
      </div>

      {/* Info (hidden for merged child tables) */}
      {!isMerged && (
        <div className="mt-0.5">
          {isOccupied && (
            <div className="space-y-1.5">
              <div className={`flex items-center gap-2.5 ${lightMode ? 'text-gray-500' : 'text-white/45'}`}>
                <div className="flex items-center gap-1.5">
                  <Users size={11} />
                  <span className="text-[11px] font-medium tabular-nums">{table.guest_count}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={11} />
                  <span className="text-[11px] font-medium tabular-nums">{timeSince(table.opened_at ?? null)}</span>
                </div>
                {isOverdue && table.oldest_pending_at && (
                  <div className="flex items-center gap-1 text-red-400">
                    <AlertTriangle size={10} />
                    <span className="text-[10px] font-bold tabular-nums">{timeSince(table.oldest_pending_at)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Utensils size={11} />
                  <span className="text-[11px] font-medium tabular-nums">{table.order_count}</span>
                </div>
              </div>
              <div className={`text-sm font-black tabular-nums ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>{table.total_amount.toFixed(2)} ₼</div>
            </div>
          )}
          {!isOccupied && !isGroupParent && (
            <div className="py-3 flex items-center justify-center">
              <span className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${lightMode ? 'text-gray-400' : 'text-zinc-500'}`}>BOŞ</span>
            </div>
          )}
        </div>
      )}

      {/* Merged child — show connection */}
      {isMerged && (
        <div className="py-2 flex items-center gap-2">
          <div className={`h-8 w-px ${lightMode ? 'bg-zinc-300' : 'bg-zinc-600/50'}`} />
          <div className="flex flex-col">
            <span className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Masa {table.merged_into_table}
            </span>
            <span className={`text-[8px] uppercase tracking-[0.2em] ${lightMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Birləşdi
            </span>
          </div>
        </div>
      )}

    </motion.button>
  );
}
