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
const LOG_COLORS: Record<string, string> = {
  stock_in: 'text-emerald-400', waste: 'text-red-400', adjustment: 'text-gold', order_consumption: 'text-white/40',
};

function fmt(n: number, dec = 0) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCost(n: number) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1,    y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
  exit:   { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

function StockBar({ ratio, status }: { ratio: number; status: string }) {
  const pct = Math.min(Math.max(ratio, 0), 100);
  return <StockStatusBar status={status} pct={pct} />;
}

type ModalMode = 'stock_in' | 'waste' | 'new_ingredient' | 'edit_ingredient' | 'audit' | 'history' | null;
interface ActiveModal { mode: ModalMode; row?: InventoryStatusRow }

export default function StockPage() {
  const { lightMode } = useTheme();
  const [data, setData]       = useState<InventoryDashboardData & { alerts: LowStockAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<ActiveModal>({ mode: null });
  const [selectedRow, setSelectedRow] = useState<InventoryStatusRow | null>(null);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter]   = useState<'all' | 'critical' | 'out_of_stock'>('all');
  const [viewMode, setViewMode] = useState<'stock' | 'intelligence' | 'history'>('stock');
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam && ['stock', 'intelligence', 'history'].includes(tabParam)) {
      setViewMode(tabParam as typeof viewMode);
    }
  }, [tabParam]);
  const now = new Date();
  const [historyMonth, setHistoryMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [historyDay, setHistoryDay] = useState<string | null>(null);

  // Form fields
  const [qty, setQty]           = useState('');
  const [cost, setCost]         = useState('');
  const [reason, setReason]     = useState('');
  const [newName, setNewName]   = useState('');
  const [newUnit, setNewUnit]   = useState<DisplayUnit>('gram');
  const [newLimit, setNewLimit] = useState('500');
  const [newCost, setNewCost]   = useState('');
  const [newTotalQty, setNewTotalQty] = useState('');
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newWastePct, setNewWastePct] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [qsName, setQsName] = useState('');
  const [qsPhone, setQsPhone] = useState('');
  const [qsContact, setQsContact] = useState('');
  const [editRow, setEditRow] = useState<InventoryStatusRow | null>(null);
  const [auditQty, setAuditQty] = useState('');
  const [historyLogs, setHistoryLogs] = useState<InventoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allLogs, setAllLogs] = useState<InventoryLog[]>([]);
  const [allLogsLoading, setAllLogsLoading] = useState(false);
  const lastFetchTimeRef = useRef(0);
  const toastStyle = { background: '#0f0f0f', color: '#fff', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px' };


  const fetchData = useCallback(async () => {
    lastFetchTimeRef.current = Date.now();
    setLoading(true);
    try {
        const invRes = await fetch('/api/inventory');
        if (invRes.ok) {
            setData(await invRes.json());
        } else {
            setData({ items: [], stats: { total: 0, critical: 0, out_of_stock: 0, monthly_waste_cost: 0 }, alerts: [] });
            toast.error('Inventory data could not be loaded.', { style: toastStyle });
        }
    } catch (error) {
        console.error("Failed to fetch inventory:", error);
        setData({ items: [], stats: { total: 0, critical: 0, out_of_stock: 0, monthly_waste_cost: 0 }, alerts: [] });
        toast.error('An error occurred while fetching inventory.', { style: toastStyle });
    }

    try {
        const supRes = await fetch('/api/suppliers');
        if (supRes.ok) {
            setSuppliers(await supRes.json());
        } else {
            setSuppliers([]);
            toast.error('Supplier data could not be loaded.', { style: toastStyle });
        }
    } catch (error) {
        console.error("Failed to fetch suppliers:", error);
        setSuppliers([]);
        toast.error('An error occurred while fetching suppliers.', { style: toastStyle });
    }

    setLoading(false);
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


  return (
    <PageTransition className="min-h-screen bg-[#070707] text-white pb-24">
       <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_42%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_30%)] pointer-events-none" />
       <div className="max-w-none mx-auto px-4 sm:px-6 pt-6 sm:pt-10 relative">
        <div className="space-y-6 min-w-0">
          <section className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-white/[0.03] px-6 py-6 sm:px-8 sm:py-8 backdrop-blur-2xl shadow-[0_30px_120px_rgba(0,0,0,0.28)]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_36%,transparent_64%,rgba(212,175,55,0.08))]" />
              <div className="relative flex flex-col gap-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl space-y-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-[0.22em] text-white/55 uppercase">
                            <Sparkles size={12} className="text-[#D4AF37]" />
                            Premium inventory control
                        </div>
                        <div className="space-y-3">
                            <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.06em] leading-[0.95] text-white/95">Stok</h1>
                            <p className="max-w-xl text-sm sm:text-base leading-6 text-white/46">
                            İnqredientlərin canlı vəziyyəti, kritik risklər və hərəkət tarixçəsi üçün sakit, premium iş səthi.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => {}}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.12] bg-white text-black px-5 py-3 text-sm font-semibold tracking-[-0.01em] transition-transform active:scale-[0.98]"
                        >
                            <Plus size={16} /> Yeni Xammal
                        </button>
                    </div>
                </div>

                <InventoryHealthCard stats={stats} loading={loading} />

              </div>
            </section>
            {loading ? (
               <div className="flex items-center justify-center min-h-[28rem] rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
                  <Loader2 size={28} className="animate-spin text-white/15" />
                </div>
            ) : (
              <GlassCard intensity="light" padding="none" className="overflow-hidden bg-white/[0.04] backdrop-blur-xl xl:min-h-[36rem]">
                    <div
                      className="hidden lg:grid gap-4 px-6 py-3 text-[11px] font-medium uppercase text-white/25 tracking-wider"
                      style={{
                        gridTemplateColumns: '1fr 120px 100px 140px 100px 90px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <span>Ad</span>
                      <span>Stok Səviyyəsi</span>
                      <span className="text-right">Stok</span>
                      <span className="text-right">Maya Dəyəri</span>
                      <span className="text-center">Status</span>
                      <span className="text-center">Əməliyyat</span>
                    </div>

                    {rows.map((row) => {
                      const meta = getStatusMeta(row.status);
                      return (
                        <div
                          id={'row-' + row.id}
                          key={row.id}
                          className="px-4 lg:px-6 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors duration-150 cursor-pointer"
                          onClick={() => setSelectedRow(row)}
                        >
                          <div
                            className="hidden lg:grid gap-4 items-center"
                            style={{ gridTemplateColumns: '1fr 120px 100px 140px 100px 90px' }}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white/90 truncate leading-none">{row.name}</p>
                              <p className="text-[11px] text-white/25 mt-1">{UNIT_LABELS[row.unit]}</p>
                            </div>
                            <div className="pr-8">
                              <StockBar ratio={Number(row.stock_ratio)} status={row.status} />
                            </div>
                            <div className="text-right">
                              <span className="text-base font-semibold tabular-nums text-white/90">
                                {fmt(row.current_stock, 1)}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold tabular-nums text-white/95">
                                ₼{fmtCost((row.current_stock || 0) * (row.purchase_price ?? row.average_cost_per_unit))}
                              </p>
                              <p className="text-[11px] text-white/30 mt-0.5">
                                ₼{fmtCost(row.purchase_price ?? row.average_cost_per_unit)} / {UNIT_LABELS[row.unit]}
                              </p>
                            </div>
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold ${meta.bg} ${meta.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                                {meta.label}
                              </span>
                            </div>
                             <div className="flex justify-center">
                                <button className="text-white/40 hover:text-white">...</button>
                             </div>
                          </div>
                        </div>
                      );
                    })}
                  </GlassCard>
            )}
        </div>
      </div>
    </PageTransition>
  );
}
