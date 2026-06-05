'use client';

import { motion } from 'framer-motion';
import { Clock, Users, DollarSign, Utensils } from 'lucide-react';
import type { PosTable } from '../types';

const statusConfig: Record<string, { label: string; dot: string; bg: string; border: string; text: string; glow: string }> = {
  empty: {
    label: 'Boş', dot: 'bg-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20',
    text: 'text-emerald-300', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.08)]',
  },
  active: {
    label: 'Aktiv', dot: 'bg-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/20',
    text: 'text-blue-300', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.08)]',
  },
  waiting_bill: {
    label: 'Hesab', dot: 'bg-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/25',
    text: 'text-amber-300', glow: 'shadow-[0_0_25px_rgba(251,191,36,0.12)]',
  },
  cooking: {
    label: 'Mətbəx', dot: 'bg-violet-400', bg: 'bg-violet-500/5', border: 'border-violet-500/20',
    text: 'text-violet-300', glow: 'shadow-[0_0_20px_rgba(167,139,250,0.08)]',
  },
  problem: {
    label: 'Problem', dot: 'bg-red-400', bg: 'bg-red-500/5', border: 'border-red-500/25',
    text: 'text-red-300', glow: 'shadow-[0_0_25px_rgba(248,113,113,0.12)]',
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
  table, onTap, isSelected,
}: {
  table: PosTable;
  onTap: () => void;
  isSelected: boolean;
}) {
  const cfg = statusConfig[table.status] || statusConfig.empty;
  const isOccupied = table.status !== 'empty';

  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.95 }}
      onClick={onTap}
      className={`relative flex flex-col rounded-2xl border p-4 text-left transition-all ${cfg.bg} ${cfg.border} ${isSelected ? 'ring-2 ring-white/30 shadow-xl' : ''} ${cfg.glow}`}
    >
      {/* Pulse for waiting */}
      {table.status === 'waiting_bill' && (
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 rounded-2xl bg-amber-400/5 pointer-events-none"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black ${isSelected ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-white/70'}`}>
            {table.table_number}
          </div>
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${cfg.dot.replace('bg-', 'text-').replace('400', '300')} ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Info */}
      {isOccupied && (
        <div className="space-y-2 mt-1">
          <div className="flex items-center gap-3 text-white/40">
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
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-gold/60" />
            <span className="text-sm font-black tabular-nums text-gold">{table.total_amount.toFixed(2)} ₼</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isOccupied && (
        <div className="py-3 flex items-center justify-center">
          <span className="text-[10px] uppercase tracking-[0.15em] text-white/15 font-semibold">Boş</span>
        </div>
      )}
    </motion.button>
  );
}
