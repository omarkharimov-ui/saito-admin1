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
  const [viewMode, setViewMode] = useState<'stock' | 'intelligence' | 'suppliers'>('stock');
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

  const handleAction = async (type: 'stock_in' | 'waste' | 'adjustment') => {
    if (!selectedRow || !qtyInput) return;
    setSaving(true);
    const amount = parseFloat(qtyInput);
    
    try {
      const res = await fetch('/api/inventory/logs', {
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

      if (res.ok) {
        toast.success('Əməliyyat uğurla tamamlandı');
        setModalMode(null);
        setQtyInput('');
        setReasonInput('');
        fetchData();
      } else {
        throw new Error('Xəta baş verdi');
      }
    } catch (e) {
      toast.error('Gözlənilməz xəta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-[#070707] text-white pb-24">
      <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_42%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_30%)] pointer-events-none" />
      
      <div className="max-w-none mx-auto px-4 sm:px-6 pt-6 sm:pt-10 relative">
        <div className="space-y-6">
          
          {/* Hero Section */}
          <section className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-white/[0.03] px-8 py-8 backdrop-blur-2xl shadow-2xl">
            <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-gold uppercase">
                  <Sparkles size={12} /> PRO INVENTORY
                </div>
                <h1 className="text-5xl font-black tracking-tighter text-white">Stok Paneli</h1>
                <div className="flex gap-2">
                  <button onClick={() => setViewMode('stock')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'stock' ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>Anbar</button>
                  <button onClick={() => setViewMode('intelligence')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'intelligence' ? 'bg-gold text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>Ağıllı Analiz</button>
                  <button onClick={() => setViewMode('suppliers')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'suppliers' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>Tədarükçülər</button>
                </div>
              </div>
              <InventoryHealthCard stats={stats} loading={loading} />
            </div>
          </section>

          {viewMode === 'stock' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Main List */}
              <div className="lg:col-span-8 space-y-4">
                <GlassCard padding="none" className="overflow-hidden border-white/[0.05]">
                  {/* Search & Filter */}
                  <div className="p-4 border-b border-white/[0.05] flex items-center gap-4">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                      <input 
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Xammal axtar..." 
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-12 pr-4 py-3 text-sm outline-none focus:border-white/20"
                      />
                    </div>
                    <select value={filter} onChange={e => setFilter(e.target.value as any)} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-3 text-sm outline-none">
                      <option value="all" className="bg-[#111]">Hamısı</option>
                      <option value="critical" className="bg-[#111]">Kritik</option>
                      <option value="out_of_stock" className="bg-[#111]">Bitənlər</option>
                    </select>
                  </div>

                  {/* List Rows */}
                  <div className="divide-y divide-white/[0.03]">
                    {rows.map(row => {
                      const meta = getStatusMeta(row.status);
                      return (
                        <motion.div 
                          key={row.id} onClick={() => setSelectedRow(row)}
                          className={`px-6 py-5 flex items-center justify-between cursor-pointer transition-all hover:bg-white/[0.02] ${selectedRow?.id === row.id ? 'bg-gold/[0.03] border-l-2 border-gold' : ''}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${meta.bg}`}>
                              <Package size={20} className={meta.text} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white/90">{row.name}</p>
                              <p className="text-[10px] text-white/25 uppercase tracking-widest mt-1">{UNIT_LABELS[row.unit]} · ₼{row.average_cost_per_unit.toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="text-right">
                              <p className="text-lg font-black tabular-nums text-white">{row.current_stock.toFixed(1)}</p>
                              <p className="text-[9px] text-white/20 uppercase tracking-tighter">Mövcud</p>
                            </div>
                            <div className="w-24">
                              <StockStatusBar status={row.status} pct={Math.round(row.stock_ratio)} />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>

              {/* Right Sidebar - Inspector */}
              <div className="lg:col-span-4 sticky top-6">
                <InspectorPanel 
                  row={selectedRow} 
                  onClose={() => setSelectedRow(null)} 
                  UNIT_LABELS={UNIT_LABELS}
                  onStockIn={() => setModalMode('stock_in')}
                  onWaste={() => setModalMode('waste')}
                  onAudit={() => setModalMode('audit')}
                  onHistory={() => {}}
                  onDelete={() => {}}
                  onUpdate={fetchData}
                />
              </div>
            </div>
          )}

          {viewMode === 'suppliers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {suppliers.map(s => (
                <GlassCard key={s.id} className="border-blue-500/10 hover:border-blue-500/30 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                      <Users size={24} />
                    </div>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Tədarükçü</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{s.name}</h3>
                  <p className="text-sm text-white/40 mb-4">{s.contact_person || 'Məsul şəxs yoxdur'}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
                    <span className="text-xs font-mono text-white/30">{s.phone}</span>
                    <button className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300">Ətraflı →</button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Modals Container */}
      <AnimatePresence>
        {modalMode && selectedRow && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setModalMode(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0c0c0c] border border-white/[0.1] rounded-[40px] p-8 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${modalMode === 'stock_in' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {modalMode === 'stock_in' ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white">{modalMode === 'stock_in' ? 'Stok Girişi' : 'İtki Qeydi'}</h2>
                  <p className="text-xs text-white/30 uppercase tracking-widest mt-1">{selectedRow.name}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-2">Miqdar ({UNIT_LABELS[selectedRow.unit]})</label>
                  <input 
                    type="number" autoFocus value={qtyInput} onChange={e => setQtyInput(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-3xl px-6 py-4 text-2xl font-black text-white outline-none focus:border-gold/40"
                    placeholder="0.0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-2">Qeyd (Səbəb)</label>
                  <input 
                    type="text" value={reasonInput} onChange={e => setReasonInput(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-6 py-3 text-sm text-white outline-none focus:border-white/20"
                    placeholder="Məs: Təzə mal gəldi"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => setModalMode(null)} className="flex-1 py-4 rounded-3xl border border-white/[0.08] text-white/40 font-bold uppercase tracking-widest text-[10px]">Ləğv Et</button>
                  <button 
                    onClick={() => handleAction(modalMode === 'stock_in' ? 'stock_in' : 'waste')} 
                    disabled={saving || !qtyInput}
                    className={`flex-1 py-4 rounded-3xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 ${modalMode === 'stock_in' ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'}`}
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
