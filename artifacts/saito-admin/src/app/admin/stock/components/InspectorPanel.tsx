'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, TrendingUp, TrendingDown, AlertTriangle, History, Trash2, ClipboardCheck, Pencil, Save, Trash } from 'lucide-react';
import type { InventoryStatusRow, InventoryLog, Supplier } from '@/types/inventory';
import React, { useState, useMemo, useEffect } from 'react';
import { StockStatusBar } from '@/components/StockStatusBadge';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

interface InspectorPanelProps {
  row: InventoryStatusRow | null;
  onClose: () => void;
  UNIT_LABELS: Record<string, string>;
  onStockIn: (row: InventoryStatusRow) => void;
  onWaste: (row: InventoryStatusRow) => void;
  onAudit: (row: InventoryStatusRow) => void;
  onHistory: (row: InventoryStatusRow) => void;
  onDelete: (row: InventoryStatusRow) => void;
  onUpdate: () => void;
}

const statusMeta: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  normal:     { label: 'Normal',   dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
  critical:   { label: 'Kritik',   dot: 'bg-amber-400',   bg: 'bg-amber-500/10',   text: 'text-amber-300' },
  out_of_stock: { label: 'Bitib',  dot: 'bg-red-400',     bg: 'bg-red-500/10',     text: 'text-red-300' },
};

export function InspectorPanel({ row, onClose, UNIT_LABELS, onStockIn, onWaste, onAudit, onHistory, onDelete, onUpdate }: InspectorPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', critical_limit: 0, purchase_price: 0, cold_waste_percentage: 0 });

  useEffect(() => {
    if (row) {
      setEditForm({
        name: row.name,
        critical_limit: row.critical_limit,
        purchase_price: row.purchase_price ?? row.average_cost_per_unit,
        cold_waste_percentage: row.cold_waste_percentage || 0
      });
      setIsEditing(false);
    }
  }, [row]);

  const meta = row ? statusMeta[row.status] : null;

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase.from('ingredients').update({
      name: editForm.name,
      critical_limit: editForm.critical_limit,
      purchase_price: editForm.purchase_price,
      cold_waste_percentage: editForm.cold_waste_percentage
    }).eq('id', row.id);

    if (error) {
      toast.error('Yadda saxlamaq mümkün olmadı');
    } else {
      toast.success('Xammal yeniləndi');
      setIsEditing(false);
      onUpdate();
    }
    setSaving(false);
  };

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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-[100] lg:hidden backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            className="fixed right-4 top-4 bottom-4 w-full max-w-md z-[101] overflow-hidden rounded-[32px] border border-white/[0.1] bg-[#080808]/90 backdrop-blur-3xl shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-6 flex items-center justify-between border-b border-white/[0.05]">
              <div className="min-w-0 flex-1">
                {isEditing ? (
                   <input 
                    value={editForm.name} 
                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-lg font-bold text-white outline-none focus:border-gold/50 transition-all w-full"
                   />
                ) : (
                  <h2 className="text-xl font-black text-white tracking-tight truncate">{row.name}</h2>
                )}
                <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mt-1.5">{UNIT_LABELS[row.unit]} · {row.id.slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsEditing(!isEditing)} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.05] text-white/40 hover:text-white transition-all">
                  {isEditing ? <X size={18} /> : <Pencil size={18} />}
                </button>
                <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.05] text-white/40 hover:text-white transition-all">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-none">
              {/* Status Section */}
              <div className="flex items-center justify-between p-5 rounded-3xl bg-white/[0.03] border border-white/[0.05]">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Cari Vəziyyət</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${meta?.dot} shadow-[0_0_10px_currentColor]`} />
                    <span className={`text-sm font-bold ${meta?.text}`}>{meta?.label}</span>
                  </div>
                </div>
                <div className="w-32">
                  <StockStatusBar status={row.status} pct={Math.round(row.stock_ratio)} />
                </div>
              </div>

              {/* Edit Form or Detail Grid */}
              <div className="space-y-6">
                 <h3 className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">Xammal Məlumatları</h3>
                 {isEditing ? (
                   <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Kritik Limit ({UNIT_LABELS[row.unit]})</label>
                        <input type="number" value={editForm.critical_limit} onChange={e => setEditForm({...editForm, critical_limit: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-gold/50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Maya Dəyəri (₼)</label>
                        <input type="number" step="0.01" value={editForm.purchase_price} onChange={e => setEditForm({...editForm, purchase_price: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-gold/50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Soyuq İtki (%)</label>
                        <input type="number" value={editForm.cold_waste_percentage} onChange={e => setEditForm({...editForm, cold_waste_percentage: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-gold/50" />
                      </div>
                      <button onClick={handleSave} disabled={saving} className="w-full py-4 rounded-2xl bg-gold text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 mt-4">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Dəyişiklikləri Saxla
                      </button>
                   </div>
                 ) : (
                   <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                    {detailItems.map(item => (
                      <div key={item.label} className="space-y-1">
                        <p className="text-[10px] text-white/30 font-medium uppercase tracking-wider">{item.label}</p>
                        <p className={`text-base font-bold tabular-nums ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                   </div>
                 )}
              </div>

              {/* Main Actions */}
              <div className="space-y-4 pt-4">
                <h3 className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">Əməliyyatlar</h3>
                <div className="grid grid-cols-2 gap-3">
                  <QuickAction icon={<Package size={18} />} label="Stok Girişi" onClick={() => onStockIn(row)} color="bg-emerald-500/10 text-emerald-400" />
                  <QuickAction icon={<TrendingDown size={18} />} label="İtki Qeydi" onClick={() => onWaste(row)} color="bg-rose-500/10 text-rose-400" />
                  <QuickAction icon={<ClipboardCheck size={18} />} label="İnventar" onClick={() => onAudit(row)} color="bg-blue-500/10 text-blue-400" />
                  <QuickAction icon={<History size={18} />} label="Tarixçə" onClick={() => onHistory(row)} color="bg-white/5 text-white/60" />
                </div>
              </div>
            </div>

            {/* Delete Area */}
            <div className="p-8 pt-0 mt-auto">
              <button onClick={() => onDelete(row)} className="w-full py-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 hover:bg-rose-500/20 transition-all">
                <Trash size={14} /> Xammalı Tamamilə Sil
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function QuickAction({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-3 p-5 rounded-[24px] border border-white/[0.05] transition-all hover:border-white/10 ${color}`}
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </motion.button>
  );
}
