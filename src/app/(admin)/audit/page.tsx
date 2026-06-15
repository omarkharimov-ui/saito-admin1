'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, ShoppingBag, AlertTriangle, TrendingDown, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageTransition, PageHeader } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';

interface AuditEntry {
  id: string;
  created_at: string;
  type: 'stock_in' | 'waste' | 'adjustment' | 'order_consumption';
  quantity: number;
  cost_per_unit: number | null;
  reason: string | null;
  order_id: string | null;
  ingredient_name: string;
  ingredient_unit: string;
  product_name: string | null;
  table_number: string | null;
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  order_consumption: { label: 'Sifariş Sərfiyyatı', color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
  stock_in: { label: 'Stoka Giriş', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  waste: { label: 'İtki', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  adjustment: { label: 'Tənzimləmə', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
};

const FILTER_TABS = [
  { key: 'all', label: 'Hamısı' },
  { key: 'order_consumption', label: 'Sifariş Sərfiyyatı' },
  { key: 'waste', label: 'İtki' },
  { key: 'adjustment', label: 'Tənzimləmə' },
  { key: 'stock_in', label: 'Stoka Giriş' },
];

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      let dateFilter: string;
      if (dateRange === 'today') dateFilter = todayStart.toISOString();
      else if (dateRange === 'week') dateFilter = sevenDaysAgo;
      else if (dateRange === 'month') dateFilter = thirtyDaysAgo;
      else dateFilter = new Date(0).toISOString();

      const { data: logs } = await supabase
        .from('inventory_logs')
        .select('id, type, quantity, cost_per_unit, reason, order_id, created_at, ingredient:ingredients(name, unit)')
        .gte('created_at', dateFilter)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!logs) { setEntries([]); return; }

      // Fetch order context for order_consumption logs
      const orderIds = [...new Set(logs.filter(l => l.order_id).map(l => l.order_id))].filter(Boolean) as string[];
      let orderMap: Record<string, { table_number: string | null }> = {};
      let orderItemMap: Record<string, string[]> = {};

      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, table_number')
          .in('id', orderIds);

        if (orders) {
          orderMap = Object.fromEntries(orders.map(o => [o.id, { table_number: o.table_number }]));
        }

        const { data: orderItems } = await supabase
          .from('order_items')
          .select('order_id, product_name')
          .in('order_id', orderIds);

        if (orderItems) {
          for (const item of orderItems) {
            if (!orderItemMap[item.order_id]) orderItemMap[item.order_id] = [];
            if (!orderItemMap[item.order_id].includes(item.product_name)) {
              orderItemMap[item.order_id].push(item.product_name);
            }
          }
        }
      }

      const mapped: AuditEntry[] = (logs as any[]).map(log => ({
        id: log.id,
        created_at: log.created_at,
        type: log.type,
        quantity: log.quantity,
        cost_per_unit: log.cost_per_unit,
        reason: log.reason,
        order_id: log.order_id,
        ingredient_name: (log.ingredient as any)?.name || 'Naməlum',
        ingredient_unit: (log.ingredient as any)?.unit || '',
        product_name: log.order_id && orderItemMap[log.order_id]
          ? orderItemMap[log.order_id].join(', ')
          : null,
        table_number: log.order_id ? (orderMap[log.order_id]?.table_number ?? null) : null,
      }));

      setEntries(mapped);
    } catch (e) {
      console.error('[Audit] fetch error:', e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(e => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q && !e.ingredient_name.toLowerCase().includes(q) && !(e.reason || '').toLowerCase().includes(q) && !(e.product_name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, typeFilter, search]);

  const summary = useMemo(() => {
    let totalDeductions = 0, totalWaste = 0, totalStockIn = 0, totalAdjustments = 0;
    for (const e of entries) {
      const q = Math.abs(e.quantity);
      if (e.type === 'order_consumption') totalDeductions += q;
      else if (e.type === 'waste') totalWaste += q;
      else if (e.type === 'stock_in') totalStockIn += q;
      else if (e.type === 'adjustment') totalAdjustments += q;
    }
    return { totalDeductions, totalWaste, totalStockIn, totalAdjustments, total: entries.length };
  }, [entries]);

  if (loading && entries.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <PageTransition className="min-h-screen p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <PageHeader
        icon={<AlertTriangle size={18} className="text-rose-400" />}
        title="Audit Trail"
        subtitle="Stok dəyişikliklərinin tam tarixçəsi — hər sifariş, itki və tənzimləmə"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard intensity="light" padding="md" className="border-blue-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400/70">Sifariş Sərfiyyatı</p>
          <p className="text-lg font-black text-slate-300 tabular-nums mt-1">{summary.totalDeductions.toFixed(1)} <span className="text-[10px] font-normal opacity-50">vahid</span></p>
        </GlassCard>
        <GlassCard intensity="light" padding="md" className="border-red-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/60">İtki</p>
          <p className="text-lg font-black text-red-400 tabular-nums mt-1">{summary.totalWaste.toFixed(1)} <span className="text-[10px] font-normal opacity-50">vahid</span></p>
        </GlassCard>
        <GlassCard intensity="light" padding="md" className="border-amber-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/60">Tənzimləmə</p>
          <p className="text-lg font-black text-amber-400 tabular-nums mt-1">{summary.totalAdjustments.toFixed(1)} <span className="text-[10px] font-normal opacity-50">vahid</span></p>
        </GlassCard>
        <GlassCard intensity="light" padding="md" className="border-emerald-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/60">Stoka Giriş</p>
          <p className="text-lg font-black text-emerald-400 tabular-nums mt-1">{summary.totalStockIn.toFixed(1)} <span className="text-[10px] font-normal opacity-50">vahid</span></p>
        </GlassCard>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Xammal, səbəb və ya məhsul axtar..."
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${
                typeFilter === tab.key
                  ? 'bg-rose-500/15 border border-rose-500/25 text-rose-300'
                  : 'text-white/40 hover:text-white/70 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {(['today', 'week', 'month', 'all'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDateRange(d)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${
                dateRange === d
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'text-white/30 hover:text-white/60 border border-transparent'
              }`}
            >
              {d === 'today' ? 'Bugün' : d === 'week' ? 'Həftə' : d === 'month' ? 'Ay' : 'Hamısı'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-white/20 text-sm">Heç bir əməliyyat tapılmadı</div>
        ) : (
          filtered.map((entry, idx) => {
            const meta = TYPE_LABELS[entry.type] || TYPE_LABELS.order_consumption;
            const sign = entry.type === 'stock_in' || (entry.type === 'adjustment' && entry.quantity > 0) ? '+' : '\u2212';
            const dt = new Date(entry.created_at);
            return (
              <motion.div
                key={entry.id || idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.015 }}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center shrink-0 mt-0.5`}>
                      {entry.type === 'order_consumption' ? (
                        <ShoppingBag size={14} className={meta.color} />
                      ) : entry.type === 'waste' ? (
                        <TrendingDown size={14} className={meta.color} />
                      ) : (
                        <ArrowRight size={14} className={meta.color} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${meta.color} ${meta.bg}`}>
                          {meta.label}
                        </span>
                        <span className="text-sm font-semibold text-white/90">
                          {entry.ingredient_name}
                        </span>
                        <span className={`text-sm font-bold tabular-nums ${meta.color}`}>
                          {sign}{Math.abs(entry.quantity).toFixed(2)} {entry.ingredient_unit}
                        </span>
                      </div>
                      {/* Order context */}
                      {entry.type === 'order_consumption' && entry.order_id && (
                        <div className="mt-1.5 flex items-center gap-2 text-xs">
                          <span className="text-white/30">Sifariş:</span>
                          <span className="font-mono text-[10px] text-white/50 bg-white/[0.04] px-1.5 py-0.5 rounded">
                            #{entry.order_id.slice(0, 8)}
                          </span>
                          {entry.table_number && (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="text-white/40">Masa {entry.table_number}</span>
                            </>
                          )}
                          {entry.product_name && (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="text-white/50 truncate max-w-[200px]">{entry.product_name}</span>
                            </>
                          )}
                        </div>
                      )}
                      {/* Waste/adjustment reason */}
                      {entry.reason && (
                        <p className="mt-1 text-xs text-white/40 italic">{entry.reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-white/40 tabular-nums">
                      {dt.toLocaleDateString('az-AZ', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-[10px] text-white/20 tabular-nums">
                      {dt.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </PageTransition>
  );
}
