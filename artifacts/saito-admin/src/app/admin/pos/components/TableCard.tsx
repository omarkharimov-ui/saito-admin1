'use client';

import { motion } from 'framer-motion';
import { Clock, Users, Utensils, MoreVertical, GitMerge, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { PosTable } from '../types/shared';

const statusStyles: Record<string, { dot: string; bg: string; border: string; text: string; glow: string; lightBg: string; lightBorder: string; lightText: string }> = {
  empty: {
    dot: 'bg-zinc-500', bg: 'bg-[#101012]', border: 'border-zinc-800',
    text: 'text-zinc-400', glow: '',
    lightBg: 'bg-zinc-50', lightBorder: 'border-zinc-200', lightText: 'text-zinc-400',
  },
  active: {
    dot: 'bg-[var(--theme-blue)]', bg: 'bg-[#182036] backdrop-blur-md', border: 'border-[var(--theme-blue-border)]',
    text: 'text-[var(--theme-blue)]', glow: 'shadow-[0_0_30px_var(--theme-blue-border)]',
    lightBg: 'bg-[var(--theme-blue-soft)]', lightBorder: 'border-[var(--theme-blue-border)]', lightText: 'text-[var(--theme-blue)]',
  },
  waiting_bill: {
    dot: 'bg-amber-400', bg: 'bg-[#261b10] backdrop-blur-md', border: 'border-amber-500/40',
    text: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.15)]',
    lightBg: 'bg-amber-50/70', lightBorder: 'border-amber-200', lightText: 'text-amber-700',
  },
  cooking: {
    dot: 'bg-violet-400', bg: 'bg-[#1e1536] backdrop-blur-md', border: 'border-violet-500/35',
    text: 'text-violet-400', glow: 'shadow-[0_0_30px_rgba(167,139,250,0.12)]',
    lightBg: 'bg-violet-50/70', lightBorder: 'border-violet-200', lightText: 'text-violet-700',
  },
  merged: {
    dot: 'bg-zinc-400', bg: 'bg-zinc-900 backdrop-blur-md', border: 'border-zinc-700/40',
    text: 'text-zinc-400', glow: 'shadow-[0_0_20px_rgba(161,161,170,0.08)]',
    lightBg: 'bg-zinc-100/80', lightBorder: 'border-zinc-300', lightText: 'text-zinc-600',
  },
  problem: {
    dot: 'bg-red-400', bg: 'bg-[#2e0f0f] backdrop-blur-md', border: 'border-red-500/40',
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

const statusLabelKeys: Record<string, string> = {
  empty: 'empty',
  active: 'status_active',
  waiting_bill: 'status_waiting_bill',
  cooking: 'status_cooking',
  merged: 'merged',
  problem: 'status_problem',
};

export function TableCard({
  table, onTap, onAction, isSelected, isTransferSource, isTransferTarget, isOverdue,
}: {
  table: PosTable;
  onTap: () => void;
  onAction?: () => void;
  isSelected: boolean;
  isTransferSource?: boolean;
  isTransferTarget?: boolean;
  isOverdue?: boolean;
}) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const cfg = statusStyles[table.status] || statusStyles.empty;
  const statusLabel = t((statusLabelKeys[table.status] || 'empty') as 'empty' | 'status_active' | 'status_waiting_bill' | 'status_cooking' | 'merged' | 'status_problem');
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
      whileTap={{ scale: 0.96 }}
      onClick={onTap}
      className={`relative h-[120px] rounded-[24px] bg-[var(--theme-surface)] p-5 text-left transition-all duration-500 overflow-hidden shadow-sm hover:shadow-md
        ${table.status === 'occupied' ? 'border-l-[6px] border-l-emerald-500' : 
          table.status === 'dirty' ? 'border-l-[6px] border-l-orange-500' : 
          table.status === 'reserved' ? 'border-l-[6px] border-l-blue-500' : 
          'border-l-[6px] border-l-[var(--theme-text-muted)] opacity-60 hover:opacity-100'}`}
    >
      {/* Static subtle glow for waiting bill — no pulse */}
      {table.status === 'waiting_bill' && (
        <span className={`absolute inset-0 rounded-2xl pointer-events-none ${lightMode ? 'bg-amber-100/40' : 'bg-amber-400/[0.04]'}`} />
      )}

      {/* Overdue pending pulse */}
      {isOverdue && (
        <span className="absolute inset-0 rounded-2xl pointer-events-none ring-2 ring-red-500/40 animate-pulse" />
      )}

      {/* Transfer labels — Centered and clear */}
      {(isTransferSource || isTransferTarget) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none rounded-2xl overflow-hidden">
          <div className={`absolute inset-0 ${isTransferSource ? 'bg-black/40' : 'bg-gold/10'}`} />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`relative px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-[0.25em] shadow-2xl border ${
              isTransferSource 
                ? 'bg-zinc-800 border-white/20 text-white/70' 
                : 'bg-gold text-black border-gold/50 shadow-gold/20'
            }`}
          >
            {isTransferSource ? 'Mənbə' : 'Hədəf'}
          </motion.div>
        </div>
      )}

      {/* Header row: number + status + merge indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black ${isSelected ? (lightMode ? 'bg-gray-900 text-white' : 'bg-white/20 text-white') : isMerged ? (lightMode ? 'bg-zinc-300 text-zinc-600' : 'bg-zinc-700/60 text-zinc-200') : table.status === 'empty' ? (lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/[0.04] text-white/60') : lightMode ? 'bg-white/80 text-gray-700 shadow-sm' : 'bg-white/[0.06] text-white/80'}`}>
            {isGroupParent ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="text-[7px] font-bold uppercase tracking-wider">{t('group_label')}</span>
                <span className="text-[15px] font-black -mt-0.5">{table.table_number}</span>
              </span>
            ) : (
              table.table_number
            )}
          </div>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.16em] ${lightMode ? cfg.lightText : cfg.text} ${lightMode ? 'bg-white/70' : (table.status === 'empty' ? 'bg-white/[0.04]' : 'bg-black/20')}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isGroupParent && (
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${lightMode ? 'bg-zinc-200/60 text-zinc-500' : 'bg-zinc-800/50 text-zinc-400'}`}>
              <GitMerge size={14} />
            </span>
          )}
          {onAction && !isMerged && (
            <span
              onClick={e => { e.stopPropagation(); onAction(); }}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]"
            >
              <MoreVertical size={18} />
            </span>
          )}
        </div>
      </div>

      {/* Info (hidden for merged child tables) */}
      {!isMerged && (
        <div className="mt-1">
          {isOccupied && (
            <div className="space-y-2">
              <div className={`flex items-center gap-3 ${lightMode ? 'text-gray-500' : 'text-white/45'}`}>
                <div className="flex items-center gap-1.5">
                  <Users size={13} />
                  <span className="text-[13px] font-medium tabular-nums">{table.guest_count}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={13} />
                  <span className="text-[13px] font-medium tabular-nums">{timeSince(table.opened_at ?? null)}</span>
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
              <span className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${lightMode ? 'text-gray-400' : 'text-zinc-500'}`}>{statusLabel}</span>
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
              {t('table_label')} {table.merged_into_table}
            </span>
            <span className={`text-[8px] uppercase tracking-[0.2em] ${lightMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {t('merged')}
            </span>
          </div>
        </div>
      )}

    </motion.button>
  );
}
