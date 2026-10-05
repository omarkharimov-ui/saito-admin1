'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, TrendingUp, TrendingDown, AlertTriangle, History, Trash2, ClipboardCheck, Pencil, Save, Trash, ChevronRight, Loader2 } from '@/components/ui/saito-icons';
import type { InventoryStatusRow, InventoryLog, Supplier } from '@/types/inventory';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { StockStatusBar } from '@/components/StockStatusBadge';
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

  // 13c: batch/expiry layer — FEFO attention list (supplementary; never
  // gates the frozen aggregate consumption engine).
  const [batches, setBatches] = useState<any[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchForm, setBatchForm] = useState({ qty: '', expiry_date: '', source: '' });

  const loadBatches = useCallback(async (ingredientId: string) => {
    setBatchLoading(true);
    try {
      const r = await fetch(`/api/stock/batches?ingredient_id=${ingredientId}`);
      if (r.ok) setBatches(await r.json());
    } catch {}
    setBatchLoading(false);
  }, []);

  useEffect(() => {
    if (row) {
      setEditForm({
        name: row.name,
        critical_limit: row.critical_limit,
        purchase_price: row.purchase_price ?? row.average_cost_per_unit,
        cold_waste_percentage: row.cold_waste_percentage || 0
      });
      setIsEditing(false);
      setShowBatchForm(false);
      setBatchForm({ qty: '', expiry_date: '', source: '' });
      loadBatches(row.id);
    }
  }, [row, loadBatches]);

  const meta = row ? statusMeta[row.status] : null;

  const batchFreshness = (expiry: string | null) => {
    if (!expiry) return { label: 'Müddət yoxdur', cls: 'text-white/30 border-white/[0.08] bg-white/[0.03]' };
    const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: 'Müddəti keçib', cls: 'text-red-400 border-red-500/25 bg-red-500/10' };
    if (days === 0) return { label: 'Bu gün bitir', cls: 'text-red-400 border-red-500/25 bg-red-500/10' };
    if (days <= 3) return { label: `${days} gün qalıb`, cls: 'text-amber-400 border-amber-500/25 bg-amber-500/10' };
    return { label: `${days} gün qalıb`, cls: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' };
  };

  const sortedBatches = useMemo(() => {
    return [...batches].sort((a, b) => {
      const ta = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const tb = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
      return ta - tb; // FEFO: earliest expiry first
    });
  }, [batches]);

  const addBatch = async () => {
    if (!row) return;
    const qty = parseFloat(batchForm.qty);
    if (isNaN(qty) || qty <= 0) { toast.error('Miqdar 0-dan böyük olmalıdır'); return; }
    const r = await fetch('/api/stock/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredient_id: row.id, qty, expiry_date: batchForm.expiry_date || null, source: batchForm.source || null }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error || 'Partiya əlavə edilmədi'); return; }
    toast.success('Partiya əlavə edildi');
    setBatchForm({ qty: '', expiry_date: '', source: '' });
    setShowBatchForm(false);
    loadBatches(row.id);
    onUpdate();
  };

  const deleteBatch = async (id: string) => {
    const r = await fetch(`/api/stock/batches/${id}`, { method: 'DELETE' });
    if (!r.ok) { toast.error('Partiya silinmədi'); return; }
    toast.success('Partiya silindi');
    if (row) loadBatches(row.id);
    onUpdate();
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    const res = await fetch('/api/inventory/' + row.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        critical_limit: editForm.critical_limit,
        purchase_price: editForm.purchase_price,
        cold_waste_percentage: editForm.cold_waste_percentage,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      toast.error(errData.error || 'Yadda saxlamaq mümkün olmadı');
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
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-lg font-bold text-white outline-none focus:border-emerald-400/60 transition-all w-full"
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
                        <input type="number" value={editForm.critical_limit} onChange={e => setEditForm({...editForm, critical_limit: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-400/60" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Maya Dəyəri (₼)</label>
                        <input type="number" step="0.01" value={editForm.purchase_price} onChange={e => setEditForm({...editForm, purchase_price: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-400/60" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Soyuq İtki (%)</label>
                        <input type="number" value={editForm.cold_waste_percentage} onChange={e => setEditForm({...editForm, cold_waste_percentage: Number(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-400/60" />
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

               {/* 13c: Partiyalar (batch/expiry) — FEFO attention list */}
               <div className="space-y-4 pt-4">
                 <div className="flex items-center justify-between">
                   <h3 className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">Partiyalar · FEFO</h3>
                   <button onClick={() => setShowBatchForm(v => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.07] text-white/50 hover:text-white transition-all">
                     {showBatchForm ? <X size={12} /> : <Package size={12} />} {showBatchForm ? 'Bağla' : 'Partiya əlavə et'}
                   </button>
                 </div>
                 {showBatchForm && (
                   <div className="grid grid-cols-2 gap-2.5">
                     <div className="space-y-1.5 col-span-2 sm:col-span-1">
                       <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Miqdar ({UNIT_LABELS[row.unit]})</label>
                       <input type="number" min="0" step="0.001" value={batchForm.qty} onChange={e => setBatchForm(p => ({ ...p, qty: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Döymə tarixi</label>
                       <input type="date" value={batchForm.expiry_date} onChange={e => setBatchForm(p => ({ ...p, expiry_date: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[10px] text-white/30 uppercase tracking-widest ml-1">Mənbə</label>
                       <input value={batchForm.source} onChange={e => setBatchForm(p => ({ ...p, source: e.target.value }))} placeholder="Tədarükçü / PO" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
                     </div>
                     <button onClick={addBatch} className="col-span-2 sm:col-span-1 self-end flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-[11px] font-bold uppercase tracking-wider text-white/80 hover:text-white transition-all">
                       <Save size={13} /> Saxla
                     </button>
                   </div>
                 )}
                 {batchLoading ? (
                   <p className="text-xs text-white/25">Yüklenir...</p>
                 ) : sortedBatches.length === 0 ? (
                   <p className="text-xs text-white/25">Partiya qeydi yoxdur — tədarükçü gəlində batch qeyd edin (tazəlik izi).</p>
                 ) : (
                   <div className="space-y-1.5">
                     {sortedBatches.map((b) => {
                       const f = batchFreshness(b.expiry_date);
                       return (
                         <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                           <div className="min-w-0">
                             <p className="text-sm font-semibold text-white/90 tabular-nums">{b.qty} {UNIT_LABELS[row.unit]}</p>
                             <p className="text-[10px] text-white/30 truncate">{b.source || 'Mənbə yoxdur'}{b.note ? ` · ${b.note}` : ''}</p>
                           </div>
                           <div className="flex items-center gap-2 shrink-0">
                             <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${f.cls}`}>{f.label}</span>
                             <button onClick={() => deleteBatch(b.id)} className="p-1.5 rounded-lg text-white/20 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                           </div>
                         </div>
                       );
                     })}
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
      className={`flex flex-col items-center justify-center gap-3 p-5 rounded-[24px] border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] transition-all hover:border-[var(--theme-text)]/20 ${color}`}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </motion.button>
  );
}
