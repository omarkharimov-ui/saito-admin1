'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { motion } from 'framer-motion';
import { TrendingUp, Users, ShoppingBag, Clock, DollarSign, ArrowUpRight, ArrowDownRight, UserPlus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useMinimumLoadingTime } from '@/hooks/useMinimumLoadingTime';

type TimeFilter = 'today' | 'week' | 'month' | 'year';

interface StaffStat {
  id: string;
  name: string;
  role: string;
  orders: number;
  revenue: number;
  avgCheck: number;
}

interface StatsData {
  totalRevenue: number;
  totalOrders: number;
  aov: number;
  missedRevenue: number;
  activeTables: number;
  totalFoodCost: number;
  totalWasteCost: number;
  laborCost: number;
  utilityCost: number;
  grossProfit: number;
  netProfit: number;
  foodCostPct: number;
  chartData: { date: string; value: number }[];
  financeChartData: { date: string; revenue: number; net_profit: number }[];
  productPerformance: any[];
  staffPerformance: StaffStat[];
  peakHour: string;
  topProduct: string;
}

const FILTERS: { key: TimeFilter; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'week', label: 'Həftə' },
  { key: 'month', label: 'Ay' },
  { key: 'year', label: 'İl' },
];

const StatsPage = () => {
  const { t, language } = useLanguage();
  const [rawLoading, setLoading] = useState(true);
  const loading = useMinimumLoadingTime(rawLoading, 600);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [stats, setStats] = useState<StatsData>({
    totalRevenue: 0, totalOrders: 0, aov: 0, missedRevenue: 0, activeTables: 0,
    totalFoodCost: 0, totalWasteCost: 0, laborCost: 0, utilityCost: 0,
    grossProfit: 0, netProfit: 0, foodCostPct: 0,
    chartData: [], financeChartData: [], productPerformance: [], staffPerformance: [],
    peakHour: '—', topProduct: '—',
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?timeFilter=${timeFilter}`);
      if (!res.ok) throw new Error('Stats API xətası');
      const data = await res.json();
      setStats({
        totalRevenue: data.totalRevenue ?? 0,
        totalOrders: data.totalOrders ?? 0,
        aov: data.aov ?? 0,
        missedRevenue: data.missedRevenue ?? 0,
        activeTables: data.activeTables ?? 0,
        totalFoodCost: data.totalFoodCost ?? 0,
        totalWasteCost: data.totalWasteCost ?? 0,
        laborCost: data.laborCost ?? 0,
        utilityCost: data.utilityCost ?? 0,
        grossProfit: data.grossProfit ?? 0,
        netProfit: data.netProfit ?? 0,
        foodCostPct: data.foodCostPct ?? 0,
        chartData: data.chartData ?? [],
        financeChartData: data.financeChartData ?? [],
        productPerformance: data.productPerformance ?? [],
        staffPerformance: data.staffPerformance ?? [],
        peakHour: data.peakHour ?? '—',
        topProduct: data.topProduct ?? '—',
      });
    } catch (err) {
      console.error(err);
      toast.error('Statistika yüklənərkən xəta');
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    fetchStats();
    const ch = createRealtimeChannel('stats_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchStats();
      })
      .subscribe();
    return () => { removeRealtimeChannel(ch); };
  }, [fetchStats]);

  const fmt = (n: number) => n.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => Math.round(n).toLocaleString('az-AZ');

  const kpis = [
    { label: 'Gəlir', value: `${fmt(stats.totalRevenue)} ₼`, icon: DollarSign, change: null },
    { label: 'Sifarişlər', value: fmtInt(stats.totalOrders), icon: ShoppingBag, change: null },
    { label: 'Orta çek', value: `${fmt(stats.aov)} ₼`, icon: TrendingUp, change: null },
    { label: 'Aktiv masalar', value: String(stats.activeTables), icon: Clock, change: null },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Statistika</h1>
            <p className="text-black/50 mt-1 text-sm">Restoran performansı</p>
          </div>
          <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-black/5">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setTimeFilter(f.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${timeFilter === f.key ? 'bg-black text-white shadow-md' : 'text-black/50 hover:text-black'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white rounded-3xl p-6 shadow-sm border border-black/5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-black/50 text-sm font-medium">{kpi.label}</span>
                <div className="w-10 h-10 rounded-2xl bg-black/5 flex items-center justify-center">
                  <kpi.icon size={18} className="text-black/70" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight">{kpi.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Revenue & Profit */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold mb-6">Gəlir və Mənfəət</h3>
            <div className="space-y-4">
              {stats.financeChartData.map((d, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm text-black/50 w-20 flex-shrink-0">{d.date}</span>
                  <div className="flex-1 h-8 bg-black/5 rounded-xl overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-black/90 rounded-xl" style={{ width: `${Math.min(100, (d.revenue / Math.max(...stats.financeChartData.map(x => x.revenue))) * 100)}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-white/30 rounded-xl" style={{ width: `${Math.min(100, (d.net_profit / Math.max(...stats.financeChartData.map(x => x.revenue))) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold w-24 text-right">{fmt(d.revenue)} ₼</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-3xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold mb-6">Maliyyə</h3>
            <div className="space-y-5">
              {[
                { label: 'Yemək xərci', value: stats.totalFoodCost, pct: stats.foodCostPct, color: 'bg-red-500' },
                { label: 'İtki', value: stats.totalWasteCost, pct: stats.totalRevenue > 0 ? (stats.totalWasteCost / stats.totalRevenue) * 100 : 0, color: 'bg-amber-500' },
                { label: 'Əmək haqqı', value: stats.laborCost, pct: stats.totalRevenue > 0 ? (stats.laborCost / stats.totalRevenue) * 100 : 0, color: 'bg-blue-500' },
                { label: 'Kommunal', value: stats.utilityCost, pct: stats.totalRevenue > 0 ? (stats.utilityCost / stats.totalRevenue) * 100 : 0, color: 'bg-purple-500' },
              ].map(item => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-black/60">{item.label}</span>
                    <span className="text-sm font-bold">{fmt(item.value)} ₼</span>
                  </div>
                  <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${Math.min(100, item.pct)}%` }} />
                  </div>
                  <p className="text-[10px] text-black/40 text-right">{item.pct.toFixed(1)}%</p>
                </div>
              ))}
              <div className="pt-4 border-t border-black/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Net Mənfəət</span>
                  <span className={`text-lg font-bold ${stats.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(stats.netProfit)} ₼</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/60">Brüt Mənfəət</span>
                  <span className="text-sm font-semibold">{fmt(stats.grossProfit)} ₼</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Staff Performance */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-3xl p-6 shadow-sm border border-black/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-black/5 flex items-center justify-center">
              <Users size={18} className="text-black/70" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Komanda Performansı</h3>
              <p className="text-sm text-black/50">Bu gün / dövrdə hansı işçi daha çox sifariş tutub</p>
            </div>
          </div>
          {stats.staffPerformance.length === 0 ? (
            <p className="text-black/40 text-sm py-8 text-center">Hələlik performans məlumatı yoxdur</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.staffPerformance.map((s, i) => (
                <div key={s.id} className="rounded-2xl border border-black/5 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center text-lg font-bold text-black/70">
                      {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-base">{s.name}</p>
                      <p className="text-xs text-black/50 font-medium">{s.role}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-black/5 rounded-xl">
                      <p className="text-lg font-bold">{s.orders}</p>
                      <p className="text-[10px] text-black/50 uppercase tracking-wider">Sifariş</p>
                    </div>
                    <div className="text-center p-3 bg-black/5 rounded-xl">
                      <p className="text-lg font-bold">{fmt(s.revenue)} ₼</p>
                      <p className="text-[10px] text-black/50 uppercase tracking-wider">Gəlir</p>
                    </div>
                    <div className="text-center p-3 bg-black/5 rounded-xl">
                      <p className="text-lg font-bold">{fmt(s.avgCheck)} ₼</p>
                      <p className="text-[10px] text-black/50 uppercase tracking-wider">Orta çek</p>
                    </div>
                  </div>
                  {i === 0 && s.orders > 0 && (
                    <div className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-600">
                      <ArrowUpRight size={14} /> Top performer
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Top Products */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-3xl p-6 shadow-sm border border-black/5">
          <h3 className="text-lg font-bold mb-6">Top Məhsullar</h3>
          {stats.productPerformance.length === 0 ? (
            <p className="text-black/40 text-sm py-8 text-center">Hələlik satış yoxdur</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-black/40 border-b border-black/5">
                    <th className="pb-3 font-semibold">#</th>
                    <th className="pb-3 font-semibold">Məhsul</th>
                    <th className="pb-3 font-semibold text-right">Satılan</th>
                    <th className="pb-3 font-semibold text-right">Gəlir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {stats.productPerformance.slice(0, 10).map((p, i) => (
                    <tr key={p.id} className="hover:bg-black/[0.02] transition-colors">
                      <td className="py-4 text-sm text-black/50 font-mono">{i + 1}</td>
                      <td className="py-4">
                        <p className="text-sm font-semibold">{p.name}</p>
                      </td>
                      <td className="py-4 text-sm text-right font-mono">{p.sold}</td>
                      <td className="py-4 text-sm text-right font-semibold">{fmt(p.revenue)} ₼</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default StatsPage;
