'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, TrendingDown, TrendingUp,
  X, Loader2, RefreshCw,
  ShieldAlert, Search,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Lightbulb, Calculator, Trash2,
  Sparkles, Layers3, ArrowUpRight, Database, BarChart3, Clock3, Filter,
  Save, History, ClipboardCheck, Users
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import {
  InventoryStatusRow, InventoryDashboardData,
  IngredientUnit, LowStockAlert,
  InventoryLog, DisplayUnit, normalizeToStorage, formatWithUnit, parseInputQuantity,
  Supplier,
} from '@/types/inventory';
import { getStatusMeta, StockStatusBar } from '@/components/StockStatusBadge';
import ProcurementTab from './components/ProcurementTab';
import IntelligenceTabComponent from './components/IntelligenceTab';
import { CalibrationSuggestionsPanel, CalibrationSuggestion } from './components/CalibrationSuggestionsPanel';
import { InventoryHealthCard } from './components/InventoryHealthCard';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';
import { InspectorPanel } from './components/InspectorPanel';

const UNITS: DisplayUnit[] = ['gram', 'piece', 'ml', 'kg', 'liter'];

const UNIT_LABELS: Record<DisplayUnit, string> = {
  gram: 'qram', piece: 'ədəd', ml: 'ml',
  kg: 'kq', liter: 'litr',
};

const LOG_LABELS: Record<string, string> = {
  stock_in: 'Giriş', waste: 'İtki', adjustment: 'Tənzimləmə', order_consumption: 'Sifariş',
};

function fmt(n: number, dec = 0) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCost(n: number) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type ModalMode = 'stock_in' | 'waste' | 'audit' | 'new_ingredient' | null;

export default function StockPage() {
  const { lightMode } = useTheme();
  const [data, setData] = useState<InventoryDashboardData & { alerts: LowStockAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<InventoryStatusRow | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'critical' | 'out_of_stock'>('all');
  const [viewMode, setViewMode] = useState<'stock' | 'intelligence' | 'suppliers' | 'procurement'>('stock');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Form states for modals
  const [qtyInput, setQtyInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, supRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/suppliers')
      ]);
      if (invRes.ok) setData(await invRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const ch = createRealtimeChannel('stock_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_logs' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => fetchData())
      .subscribe();
    return () => { removeRealtimeChannel(ch); };
  }, [fetchData]);

  const rows = (data?.items ?? []).filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || r.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = useMemo(() => {
    if (!data?.stats) return { total: 0, critical: 0, out_of_stock: 0, normal: 0, monthly_waste_cost: 0 };
    const { total, critical, out_of_stock } = data.stats;
    const normal = Math.max(0, total - critical - out_of_stock);
    return { ...data.stats, normal };
  }, [data?.stats]);

  const handleAction = async (type: 'stock_in' | 'waste' | 'adjustment' | 'audit') => {
    if (!selectedRow || !qtyInput) return;
    setSaving(true);
    const amount = parseFloat(qtyInput);
    
    try {
      let res: Response;

      if (type === 'audit') {
        res = await fetch('/api/inventory/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredientId: selectedRow.id, actualQty: amount })
        });
      } else {
        res = await fetch('/api/inventory/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient_id: selectedRow.id,
            type,
            quantity: type === 'stock_in' ? amount : -amount,
            reason: reasonInput || (type === 'stock_in' ? 'Stok artımı' : 'İtki qeydi'),
            cost_per_unit: selectedRow.purchase_price ?? selectedRow.average_cost_per_unit
          })
        });
      }

      if (res.ok) {
        toast.success('Əməliyyat uğurla tamamlandı');
        setModalMode(null);
        setQtyInput('');
        setReasonInput('');
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta baş verdi');
      }
    } catch (e) {
      toast.error('Gözlənilməz xəta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] pb-24">
      <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.08),transparent_42%)] pointer-events-none" />
      
      <div className="max-w-none mx-auto px-4 sm:px-6 pt-6 sm:pt-10 relative">
        <div className="space-y-6">
          
          {/* Hero Section */}
          <section className="relative overflow-hidden rounded-[32px] border border-[var(--theme-border)] bg-[var(--theme-surface)] px-8 py-8 shadow-[var(--theme-shadow)]">
            <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-gold/10 bg-gold/5 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-gold uppercase">
                  <Sparkles size={12} /> PRO INVENTORY
                </div>
                <h1 className="text-5xl font-black tracking-tighter text-[var(--theme-text)]">Stok Paneli</h1>
                <div className="flex gap-2">
                  <button onClick={() => setViewMode('stock')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'stock' ? (lightMode ? 'bg-gray-900 text-white' : 'bg-[var(--theme-surface)] text-[var(--theme-text)]') : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-hover)]'}`}>Anbar</button>
                  <button onClick={() => setViewMode('intelligence')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'intelligence' ? 'bg-gold text-black' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-hover)]'}`}>Ağıllı Analiz</button>
                  <button onClick={() => setViewMode('suppliers')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'suppliers' ? 'bg-blue-500 text-white' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-hover)]'}`}>Tədarükçülər</button>
                  <button onClick={() => setViewMode('procurement')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'procurement' ? 'bg-gold text-black' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-hover)]'}`}>Tədarük</button>
                </div>
              </div>
              <InventoryHealthCard stats={stats} loading={loading} />
            </div>
          </section>

          {viewMode === 'stock' && (
            <div className="grid grid-cols-1 gap-6 items-start">
              <div className="space-y-4">
                <div className="bg-[var(--theme-surface)] rounded-[32px] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] overflow-hidden">
                  <div className="p-6 border-b border-[var(--theme-border)] flex flex-col md:flex-row items-center gap-4 bg-[var(--theme-surface-soft)]/30">
                    <div className="relative flex-1 w-full">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
                      <input 
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Xammal axtar..." 
                        className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl pl-12 pr-4 py-3 text-sm outline-none focus:border-gold/30 text-[var(--theme-text)]"
                      />
                    </div>
                    <div className="flex bg-[var(--theme-bg)] p-1.5 rounded-2xl border border-[var(--theme-border)]">
                      <button onClick={() => setFilter('all')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? (lightMode ? 'bg-gray-900 text-white' : 'bg-[var(--theme-surface)] text-[var(--theme-text)]') : 'text-[var(--theme-text-muted)]'}`}>Hamısı</button>
                      <button onClick={() => setFilter('critical')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'critical' ? 'bg-rose-500 text-white' : 'text-[var(--theme-text-muted)]'}`}>Kritik</button>
                      <button onClick={() => setFilter('out_of_stock')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'out_of_stock' ? 'bg-red-600 text-white' : 'text-[var(--theme-text-muted)]'}`}>Bitənlər</button>
                    </div>
                  </div>

                  <div className="hidden md:grid grid-cols-12 px-8 py-4 bg-[var(--theme-bg)] border-b border-[var(--theme-border)] text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em]">
                    <div className="col-span-4">Xammal Adı</div>
                    <div className="col-span-2 text-center">Birim Qiymət</div>
                    <div className="col-span-2 text-center">Mövcud Stok</div>
                    <div className="col-span-2 text-center">Status</div>
                    <div className="col-span-2 text-right">Əməliyyat</div>
                  </div>

                  <div className="divide-y divide-[var(--theme-border)]">
                    {rows.map(row => {
                      const meta = getStatusMeta(row.status);
                      return (
                        <motion.div 
                          key={row.id} 
                          className={`px-8 py-5 grid grid-cols-1 md:grid-cols-12 items-center transition-all hover:bg-[var(--theme-surface-soft)]/50 ${selectedRow?.id === row.id ? 'bg-gold/5' : ''}`}
                        >
                          <div className="col-span-4 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center ${meta.bg}`}>
                              <Package size={22} className={meta.text} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-[var(--theme-text)]">{row.name}</p>
                              <p className="text-[10px] text-[var(--theme-text-muted)] font-bold uppercase tracking-widest mt-1">{UNIT_LABELS[row.unit]}</p>
                            </div>
                          </div>
                          <div className="col-span-2 text-center hidden md:block">
                            <p className="text-sm font-bold text-[var(--theme-text-secondary)]">₼{row.average_cost_per_unit.toFixed(2)}</p>
                          </div>
                          <div className="col-span-2 text-center">
                            <p className="text-lg font-black tabular-nums text-[var(--theme-text)]">{row.current_stock.toFixed(1)}</p>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <div className="w-24">
                              <StockStatusBar status={row.status} pct={Math.round(row.stock_ratio)} />
                            </div>
                          </div>
                          <div className="col-span-2 flex justify-end gap-3">
                             <button onClick={() => setSelectedRow(row)} className="p-2.5 rounded-xl bg-[var(--theme-bg)] hover:bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all shadow-sm">
                               <Pencil size={14} />
                             </button>
                             <button onClick={() => { setSelectedRow(row); setModalMode('stock_in'); }} className="p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 transition-all border border-emerald-500/20">
                                <TrendingUp size={14} />
                              </button>
                              <button onClick={() => { setSelectedRow(row); setModalMode('waste'); }} className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 transition-all border border-rose-500/20">
                                <TrendingDown size={14} />
                              </button>
                              <button onClick={() => { setSelectedRow(row); setModalMode('audit'); }} className="p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition-all border border-amber-500/20">
                                <ClipboardCheck size={14} />
                              </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'suppliers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {suppliers.map(s => (
                <div key={s.id} className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-[32px] p-8 shadow-[var(--theme-shadow)] hover:border-blue-500/30 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                      <Users size={24} />
                    </div>
                    <span className="text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-widest">Tədarükçü</span>
                  </div>
                  <h3 className="text-xl font-bold text-[var(--theme-text)] mb-1">{s.name}</h3>
                  <p className="text-sm text-[var(--theme-text-muted)] mb-4">{s.contact_person || 'Məsul şəxs yoxdur'}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-[var(--theme-border)]">
                    <span className="text-xs font-mono text-[var(--theme-text-muted)]">{s.phone}</span>
                    <button className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-400">Ətraflı →</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'procurement' && (
            <ProcurementTab />
          )}

        </div>
      </div>

      {/* Modals Container */}
      <AnimatePresence>
        {modalMode && selectedRow && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={() => setModalMode(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-[40px] p-10 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${modalMode === 'stock_in' ? 'bg-emerald-500/10 text-emerald-600' : modalMode === 'audit' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-600'}`}>
                  {modalMode === 'stock_in' ? <TrendingUp size={24} /> : modalMode === 'audit' ? <ClipboardCheck size={24} /> : <TrendingDown size={24} />}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[var(--theme-text)]">{modalMode === 'stock_in' ? 'Stok Girişi' : modalMode === 'audit' ? 'İnventarizasiya' : 'İtki Qeydi'}</h2>
                  <p className="text-xs text-[var(--theme-text-muted)] font-bold uppercase tracking-widest mt-1">{selectedRow.name}</p>
                  {modalMode === 'audit' && (
                    <p className="text-[10px] text-amber-500 font-bold mt-1">Cari stok: {selectedRow.current_stock.toFixed(1)} {UNIT_LABELS[selectedRow.unit]}</p>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                {modalMode === 'audit' ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                      <span className="text-xs font-bold text-[var(--theme-text-muted)] uppercase tracking-widest">Sistem stoku</span>
                      <span className="text-lg font-black text-[var(--theme-text)]">{selectedRow.current_stock.toFixed(1)} {UNIT_LABELS[selectedRow.unit]}</span>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em] ml-2">Faktiki say ({UNIT_LABELS[selectedRow.unit]})</label>
                      <input 
                        type="number" autoFocus value={qtyInput} onChange={e => setQtyInput(e.target.value)}
                        className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-3xl px-8 py-5 text-3xl font-black text-[var(--theme-text)] outline-none focus:border-amber-500/40 transition-all shadow-inner"
                        placeholder={String(selectedRow.current_stock)}
                      />
                    </div>
                    {qtyInput && (
                      <div className={`flex items-center justify-between px-4 py-3 rounded-2xl ${Math.abs(parseFloat(qtyInput) - selectedRow.current_stock) > 0.01 ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                        <span className="text-xs font-bold uppercase tracking-widest">Fərq</span>
                        <span className={`text-lg font-black ${Math.abs(parseFloat(qtyInput) - selectedRow.current_stock) > 0.01 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {(parseFloat(qtyInput) - selectedRow.current_stock) > 0 ? '+' : ''}{(parseFloat(qtyInput || '0') - selectedRow.current_stock).toFixed(1)} {UNIT_LABELS[selectedRow.unit]}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em] ml-2">Miqdar ({UNIT_LABELS[selectedRow.unit]})</label>
                      <input 
                        type="number" autoFocus value={qtyInput} onChange={e => setQtyInput(e.target.value)}
                        className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-3xl px-8 py-5 text-3xl font-black text-[var(--theme-text)] outline-none focus:border-gold/40 transition-all shadow-inner"
                        placeholder="0.0"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em] ml-2">Qeyd (Səbəb)</label>
                      <input 
                        type="text" value={reasonInput} onChange={e => setReasonInput(e.target.value)}
                        className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-2xl px-6 py-4 text-sm text-[var(--theme-text)] outline-none focus:border-gold/20 transition-all shadow-inner"
                        placeholder="Məs: Təzə mal gəldi"
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setModalMode(null)} className="flex-1 py-5 rounded-3xl border border-[var(--theme-border)] text-[var(--theme-text-muted)] font-black uppercase tracking-widest text-[10px] hover:bg-[var(--theme-bg)] transition-all">Ləğv Et</button>
                  <button 
                    onClick={() => handleAction(modalMode === 'stock_in' ? 'stock_in' : modalMode === 'audit' ? 'audit' : 'waste')} 
                    disabled={saving || !qtyInput}
                    className={`flex-1 py-5 rounded-[24px] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${modalMode === 'stock_in' ? 'bg-gray-900 text-white hover:bg-black' : modalMode === 'audit' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-rose-500 text-white hover:bg-rose-600'}`}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Təsdiqlə
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </PageTransition>
  );
}
