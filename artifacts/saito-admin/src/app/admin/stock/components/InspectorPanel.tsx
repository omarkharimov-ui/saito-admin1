'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, TrendingUp, TrendingDown, AlertTriangle, History, Trash2, ClipboardCheck, Clock } from 'lucide-react';
import type { InventoryStatusRow, InventoryLog, Supplier } from '@/types/inventory';
import { useMemo } from 'react';
import { StockStatusBar } from '@/components/StockStatusBadge';

interface InspectorPanelProps {
  row: InventoryStatusRow | null;
  onClose: () => void;
  UNIT_LABELS: Record<string, string>;
  onStockIn: (row: InventoryStatusRow) => void;
  onWaste: (row: InventoryStatusRow) => void;
  onAudit: (row: InventoryStatusRow) => void;
  onHistory: (row: InventoryStatusRow) => void;
  onDelete: (row: InventoryStatusRow) => void;
}

const statusMeta: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  normal:     { label: 'Normal',   dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
  critical:   { label: 'Kritik',   dot: 'bg-amber-400',   bg: 'bg-amber-500/10',   text: 'text-amber-300' },
  out_of_stock: { label: 'Bitib',  dot: 'bg-red-400',     bg: 'bg-red-500/10',     text: 'text-red-300' },
};

export function InspectorPanel({ row, onClose, UNIT_LABELS, onStockIn, onWaste, onAudit, onHistory, onDelete }: InspectorPanelProps) {
  const meta = row ? statusMeta[row.status] : null;

  const detailItems = useMemo(() => {
    if (!row) return [];
    const variance = row.current_stock - row.theoretical_stock;
    const stockValue = (row.current_stock || 0) * (row.purchase_price ?? row.average_cost_per_unit);
    return [
      { label: 'Cari Stok', value: `${row.current_stock.toFixed(1)} ${UNIT_LABELS[row.unit]}`, color: 'text-white/90' },
      { label: 'Teorik Stok', value: `${row.theoretical_stock.toFixed(1)} ${UNIT_LABELS[row.unit]}`, color: 'text-white/70' },
      {
        label: 'Fərq',
        value: `${variance > 0 ? '+' : ''}${variance.toFixed(1)} ${UNIT_LABELS[row.unit]}`,
        color: variance === 0 ? 'text-white/50' : variance > 0 ? 'text-emerald-400' : 'text-amber-400',
      },
      { label: 'Maya Dəyəri', value: `₼${(row.average_cost_per_unit || 0).toFixed(2)}/${UNIT_LABELS[row.unit]}`, color: 'text-white/70' },
      { label: 'Ümumi Dəyər', value: `₼${stockValue.toFixed(2)}`, color: 'text-white/90' },
      { label: 'Kritik Limit', value: `${row.critical_limit} ${UNIT_LABELS[row.unit]}`, color: 'text-white/50' },
      { label: 'İtki %', value: `${(row.cold_waste_percentage || 0).toFixed(1)}%`, color: 'text-rose-400/70' },
      { label: 'Stok Nisbəti', value: `${Math.round(row.stock_ratio)}%`, color: 'text-white/70' },
    ];
  }, [row, UNIT_LABELS]);

  return (
    <AnimatePresence>
      {row && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 1 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm z-50 lg:z-auto lg:sticky lg:top-0 lg:self-start lg:max-h-screen overflow-y-auto
                       border-l border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-2xl"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white/90 truncate">{row.name}</h2>
                <p className="text-[11px] text-white/30 mt-0.5">{UNIT_LABELS[row.unit]} · ID: {row.id.slice(0, 8)}</p>
              </div>
              <button
                onClick={onClose}
                className="ml-3 w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Status badge */}
            {meta && (
              <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                <div className="flex-1">
                  <StockStatusBar status={row.status} pct={Math.round(row.stock_ratio)} />
                </div>
              </div>
            )}

            {/* Detail grid */}
            <div className="px-5 py-4 border-b border-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">Detallar</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {detailItems.map(item => (
                  <div key={item.label}>
                    <p className="text-[10px] text-white/30">{item.label}</p>
                    <p className={`text-sm font-semibold tabular-nums mt-0.5 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-b border-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">Əməliyyatlar</p>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton icon={<Package size={14} />} label="Stok Girişi" onClick={() => onStockIn(row)} accent />
                <ActionButton icon={<TrendingDown size={14} />} label="İtki" onClick={() => onWaste(row)} />
                <ActionButton icon={<ClipboardCheck size={14} />} label="İnventarizasiya" onClick={() => onAudit(row)} />
                <ActionButton icon={<History size={14} />} label="Tarixçə" onClick={() => onHistory(row)} />
              </div>
            </div>

            {/* Delete */}
            <div className="px-5 py-4">
              <button
                onClick={() => onDelete(row)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400/60 hover:text-red-400 hover:bg-red-500/8 transition-colors"
              >
                <Trash2 size={13} />
                Xammalı Sil
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ActionButton({ icon, label, onClick, accent }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
        accent
          ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/25'
          : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
