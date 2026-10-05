'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, TrendingUp, TrendingDown, AlertTriangle, History, Trash2, ClipboardCheck, Pencil, Save, Trash, ChevronRight, Loader2 } from '@/components/ui/saito-icons';
import type { InventoryStatusRow, InventoryLog, Supplier } from '@/types/inventory';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { StockStatusBar } from '@/components/StockStatusBadge';
import { toast } from '@/lib/toast';
import { FullPanel } from '../stock-ui';

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

// 13k: light-safe status text (was 300-level — invisible on white).
const statusMeta: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  normal:     { label: 'Normal',   dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-500 light:text-emerald-600' },
  critical:   { label: 'Kritik',   dot: 'bg-amber-400',   bg: 'bg-amber-500/10',   text: 'text-amber-500 light:text-amber-600' },
  out_of_stock: { label: 'Bitib',  dot: 'bg-red-400',     bg: 'bg-red-500/10',     text: 'text-red-500 light:text-red-600' },
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

  // 13k: theme-var chips (was dark-only white/* — light-mode bug).
  const batchFreshness = (expiry: string | null) => {
    if (!expiry) return { label: 'Müddət yoxdur', cls: 'text-[var(--theme-text-muted)] border-[var(--theme-border)] bg-[var(--theme-surface-soft)]' };
    const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: 'Müddəti keçib', cls: 'text-red-500 light:text-red-600 border-red-500/25 bg-red-500/10' };
    if (days === 0) return { label: 'Bu gün bitir', cls: 'text-red-500 light:text-red-600 border-red-500/25 bg-red-500/10' };
    if (days <= 3) return { label: `${days} gün qalıb`, cls: 'text-amber-500 light:text-amber-600 border-amber-500/25 bg-amber-500/10' };
    return { label: `${days} gün qalıb`, cls: 'text-emerald-500 light:text-emerald-600 border-emerald-500/25 bg-emerald-500/10' };
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
      { label: 'Cari Stok', value: `${row.current_stock.toFixed(1)} ${UNIT_LABELS[row.unit]}`, color: 'text-[var(--theme-text)]' },
      { label: 'Teorik Stok', value: `${row.theoretical_stock.toFixed(1)} ${UNIT_LABELS[row.unit]}`, color: 'text-[var(--theme-text-secondary)]' },
      {
        label: 'Fərq',
        value: `${variance > 0 ? '+' : ''}${variance.toFixed(1)} ${UNIT_LABELS[row.unit]}`,
        color: variance === 0 ? 'text-[var(--theme-text-muted)]' : variance > 0 ? 'text-emerald-500' : 'text-amber-500 light:text-amber-600',
      },
      { label: 'Maya Dəyəri', value: `₼${(row.average_cost_per_unit || 0).toFixed(2)}/${UNIT_LABELS[row.unit]}`, color: 'text-[var(--theme-text-secondary)]' },
      { label: 'Ümumi Dəyər', value: `₼${stockValue.toFixed(2)}`, color: 'text-[var(--theme-text)]' },
      { label: 'Kritik Limit', value: `${row.critical_limit} ${UNIT_LABELS[row.unit]}`, color: 'text-[var(--theme-text-muted)]' },
      { label: 'İtki %', value: `${(row.cold_waste_percentage || 0).toFixed(1)}%`, color: 'text-rose-500/80' },
      { label: 'Stok Nisbəti', value: `${Math.round(row.stock_ratio)}%`, color: 'text-[var(--theme-text-secondary)]' },
    ];
  }, [row, UNIT_LABELS]);

  // 13k: full-height drawer (was floating rounded card), theme-var based
  // (was dark-only #080808 + white/* — light-mode bug), and the 4 big
  // "emeliyyat kartları" → one compact action row (owner: "çox sablon kimidir").
  const inputClsI = 'w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]/40 transition-colors';
  const labelClsI = 'text-[10px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider ml-1';
  const headClsI = 'text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.25em]';

  return (
    <AnimatePresence>
      {row && (
        <FullPanel onClose={onClose}>
            {/* Header (13l: full main-area panel — gift-cards pattern) */}
            <div className="px-6 sm:px-10 py-5 flex items-center justify-between gap-3 border-b border-[var(--theme-border)] shrink-0">
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                    className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-3 py-1.5 text-base font-bold text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]/40 transition-all w-full"
                  />
                ) : (
                  <h2 className="text-lg font-black text-[var(--theme-text)] tracking-tight truncate">{row.name}</h2>
                )}
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] mt-1">{UNIT_LABELS[row.unit]} · {row.id.slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setIsEditing(!isEditing)} title={isEditing ? 'Bağla' : 'Redaktə et'} className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all active:scale-90">
                  {isEditing ? <X size={15} /> : <Pencil size={15} />}
                </button>
                <button onClick={onClose} title="Bağla" className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all active:scale-90">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* 13m D12: wider content — the old max-w-3xl left a dead right half */}
              <div className="max-w-4xl mx-auto w-full px-6 sm:px-10 py-8 space-y-7">
              {/* Status Section */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em]">Cari Vəziyyət</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${meta?.dot} shadow-[0_0_10px_currentColor]`} />
                    <span className={`text-sm font-bold ${meta?.text}`}>{meta?.label}</span>
                  </div>
                </div>
                <div className="w-28">
                  <StockStatusBar status={row.status} pct={Math.round(row.stock_ratio)} />
                </div>
              </div>

              {/* Edit Form or Detail Grid */}
              <div className="space-y-4">
                <h3 className={headClsI}>Xammal Məlumatları</h3>
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-3.5">
                    <div className="space-y-1.5">
                      <label className={labelClsI}>Kritik Limit ({UNIT_LABELS[row.unit]})</label>
                      <input type="number" value={editForm.critical_limit} onChange={e => setEditForm({...editForm, critical_limit: Number(e.target.value)})} className={inputClsI} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClsI}>Maya Dəyəri (₼)</label>
                      <input type="number" step="0.01" value={editForm.purchase_price} onChange={e => setEditForm({...editForm, purchase_price: Number(e.target.value)})} className={inputClsI} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClsI}>Soyuq İtki (%)</label>
                      <input type="number" value={editForm.cold_waste_percentage} onChange={e => setEditForm({...editForm, cold_waste_percentage: Number(e.target.value)})} className={inputClsI} />
                    </div>
                    <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl bg-[var(--theme-text)] text-[var(--theme-bg)] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 mt-1">
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      Dəyişiklikləri Saxla
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {detailItems.map(item => (
                      <div key={item.label} className="space-y-0.5">
                        <p className="text-[9px] text-[var(--theme-text-muted)] font-bold uppercase tracking-wider">{item.label}</p>
                        <p className={`text-sm font-bold tabular-nums ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 13c: Partiyalar (batch/expiry) — FEFO attention list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className={headClsI}>Partiyalar · FEFO</h3>
                  <button onClick={() => setShowBatchForm(v => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all">
                    {showBatchForm ? <X size={11} /> : <Package size={11} />} {showBatchForm ? 'Bağla' : 'Partiya əlavə et'}
                  </button>
                </div>
                {showBatchForm && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5 col-span-2 sm:col-span-1">
                      <label className={labelClsI}>Miqdar ({UNIT_LABELS[row.unit]})</label>
                      <input type="number" min="0" step="0.001" value={batchForm.qty} onChange={e => setBatchForm(p => ({ ...p, qty: e.target.value }))} className={inputClsI} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClsI}>Döymə tarixi</label>
                      <input type="date" value={batchForm.expiry_date} onChange={e => setBatchForm(p => ({ ...p, expiry_date: e.target.value }))} className={inputClsI} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClsI}>Mənbə</label>
                      <input value={batchForm.source} onChange={e => setBatchForm(p => ({ ...p, source: e.target.value }))} placeholder="Tədarükçü / PO" className={inputClsI} />
                    </div>
                    <button onClick={addBatch} className="col-span-2 sm:col-span-1 self-end flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--theme-text)] text-[var(--theme-bg)] text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.98]">
                      <Save size={13} /> Saxla
                    </button>
                  </div>
                )}
                {batchLoading ? (
                  <p className="text-xs text-[var(--theme-text-muted)]">Yüklenir...</p>
                ) : sortedBatches.length === 0 ? (
                  <p className="text-xs text-[var(--theme-text-muted)]">Partiya qeydi yoxdur — tədarükçü gəlində batch qeyd edin (tazəlik izi).</p>
                ) : (
                  <div className="space-y-1.5">
                    {sortedBatches.map((b) => {
                      const f = batchFreshness(b.expiry_date);
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--theme-text)] tabular-nums">{b.qty} {UNIT_LABELS[row.unit]}</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)] truncate">{b.source || 'Mənbə yoxdur'}{b.note ? ` · ${b.note}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${f.cls}`}>{f.label}</span>
                            <button onClick={() => deleteBatch(b.id)} className="p-1.5 rounded-lg text-[var(--theme-text-muted)] hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Main Actions (13k: compact row — the 4 template cards are gone) */}
              <div className="space-y-3">
                <h3 className={headClsI}>Əməliyyatlar</h3>
                <div className="grid grid-cols-2 gap-2">
                  <QuickAction icon={<Package size={15} />} label="Stok Girişi" onClick={() => onStockIn(row)} tone="text-emerald-500" />
                  <QuickAction icon={<TrendingDown size={15} />} label="İtki Qeydi" onClick={() => onWaste(row)} tone="text-rose-500" />
                  <QuickAction icon={<ClipboardCheck size={15} />} label="İnventar" onClick={() => onAudit(row)} tone="text-blue-500" />
                  <QuickAction icon={<History size={15} />} label="Tarixçə" onClick={() => onHistory(row)} tone="text-[var(--theme-text-secondary)]" />
                </div>
              </div>

              {/* 13m D13: delete at content end (subtle) — the old always-visible
                  full-width bar was a misclick trap on every open */}
              <div className="pt-2">
                <button onClick={() => onDelete(row)} className="w-full py-2.5 rounded-xl border border-rose-500/25 text-rose-500 light:text-rose-600 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-rose-500/[0.06] transition-all active:scale-[0.99]">
                  <Trash size={13} /> Xammalı Tamamilə Sil
                </button>
              </div>
              </div>
            </div>
          </FullPanel>
      )}
    </AnimatePresence>
  );
}

function QuickAction({ icon, label, onClick, tone }: { icon: React.ReactNode; label: string; onClick: () => void; tone: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`flex items-center gap-2.5 h-11 px-3.5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] hover:bg-[var(--theme-surface)] hover:border-[var(--theme-text)]/25 transition-all ${tone}`}
    >
      {icon}
      <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
    </motion.button>
  );
}
