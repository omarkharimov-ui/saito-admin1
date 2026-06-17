'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, TrendingUp, TrendingDown, DollarSign, AlertTriangle, BarChart3, RefreshCw, Trash2 } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';

type Tab = 'margin' | 'waste';

export default function RecipeIntelligencePage() {
  const [tab, setTab] = useState<Tab>('margin');
  const [breakdowns, setBreakdowns] = useState<any[]>([]);
  const [wasteAnalyses, setWasteAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'margin' | 'profit' | 'potential'>('margin');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchBreakdowns(), fetchWaste()]);
    setLoading(false);
  };

  const fetchBreakdowns = async () => {
    try {
      const res = await fetch('/api/recipes/intelligence');
      const data = await res.json();
      setBreakdowns(data.breakdowns || []);
    } catch { /* ignore */ }
  };

  const fetchWaste = async () => {
    try {
      const res = await fetch('/api/recipes/waste-analysis');
      const data = await res.json();
      setWasteAnalyses(data.analyses || []);
    } catch { /* ignore */ }
  };

  const filtered = breakdowns.filter(b =>
    b.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'margin') return a.margin_pct - b.margin_pct;
    if (sortBy === 'profit') return b.monthly_profit - a.monthly_profit;
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return order[a.optimization_potential] - order[b.optimization_potential];
  });

  const avgMargin = breakdowns.length > 0
    ? Math.round(breakdowns.reduce((s, b) => s + b.margin_pct, 0) / breakdowns.length * 10) / 10
    : 0;
  const totalMonthlyProfit = breakdowns.reduce((s, b) => s + b.monthly_profit, 0);
  const highPotential = breakdowns.filter(b => b.optimization_potential === 'high').length;
  const lowMargin = breakdowns.filter(b => b.margin_pct < 20).length;

  const wasteWithIssues = wasteAnalyses.filter((a: any) =>
    a.waste_analysis?.some((w: any) => w.waste_pct > 10)
  );

  const formatMoney = (n: number) => `${n.toFixed(2)} ₼`;

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Resept İntellekti</h1>
            <p className="text-sm text-white/40 mt-1">Recipe Intelligence — Margin, Waste & Profit Analysis</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('margin')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'margin' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'margin' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}
            >
              Marja Təhlili
            </button>
            <button
              onClick={() => setTab('waste')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'waste' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'waste' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}
            >
              Tullantı Təhlili
              {wasteWithIssues.length > 0 && (
                <span className="ml-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold inline-flex items-center justify-center">
                  {wasteWithIssues.length}
                </span>
              )}
            </button>
            <button onClick={fetchData} className="p-2 rounded-xl bg-white/[0.05] text-white/40 hover:text-white transition-all">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {tab === 'margin' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Ort. Marja</p>
                <p className={`text-xl font-bold ${avgMargin < 20 ? 'text-red-400' : avgMargin < 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                  {avgMargin}%
                </p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Aylıq Mənfəət</p>
                <p className="text-xl font-bold text-white">{formatMoney(totalMonthlyProfit)}</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Aşağı Marja</p>
                <p className={`text-xl font-bold ${lowMargin > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{lowMargin}</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Optimizasiya</p>
                <p className="text-xl font-bold text-yellow-400">{highPotential}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                  placeholder="Məhsul axtar..."
                />
              </div>
              <div className="flex gap-2">
                {(['margin', 'profit', 'potential'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${sortBy === s ? 'text-black' : 'text-white/50 hover:text-white'}`}
                    style={{ background: sortBy === s ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}
                  >
                    {s === 'margin' ? 'Marja' : s === 'profit' ? 'Mənfəət' : 'Potensial'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-16 text-white/30">Hesablanır...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-white/20">
                <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Məlumat tapılmadı</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((b, i) => (
                  <motion.div
                    key={b.menu_item_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-2xl border p-5"
                    style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          b.optimization_potential === 'high' ? 'bg-red-500/15' :
                          b.optimization_potential === 'medium' ? 'bg-yellow-500/15' : 'bg-emerald-500/15'
                        }`}>
                          {b.optimization_potential === 'high' ? <AlertTriangle size={18} className="text-red-400" /> :
                           b.optimization_potential === 'medium' ? <TrendingUp size={18} className="text-yellow-400" /> :
                           <DollarSign size={18} className="text-emerald-400" />}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{b.product_name}</h3>
                          <p className="text-xs text-white/30">{b.monthly_units_sold} ədəd/ay</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${b.margin_pct < 20 ? 'text-red-400' : b.margin_pct < 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                          {b.margin_pct}%
                        </p>
                        <p className="text-[10px] text-white/30">marja</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
                      <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30 mb-0.5">Satış qiyməti</p>
                        <p className="text-white font-semibold">{formatMoney(b.selling_price)}</p>
                      </div>
                      <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30 mb-0.5">Maya dəyəri</p>
                        <p className="text-white font-semibold">{formatMoney(b.cost_price)}</p>
                      </div>
                      <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30 mb-0.5">Vahid mənfəət</p>
                        <p className="text-white font-semibold">{formatMoney(b.profit_per_unit)}</p>
                      </div>
                      <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30 mb-0.5">Aylıq mənfəət</p>
                        <p className="text-white font-semibold">{formatMoney(b.monthly_profit)}</p>
                      </div>
                    </div>

                    {b.cost_drivers?.length > 0 && (
                      <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <p className="text-[10px] text-white/30 font-bold tracking-wider uppercase mb-2">Xərc Faktorları</p>
                        <div className="flex flex-wrap gap-2">
                          {b.cost_drivers.map((d: any, di: number) => (
                            <div key={di} className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <span className="text-white/50">{d.ingredient_name}</span>
                              <span className="text-white font-bold">{d.cost_pct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(b.margin_pct, 100)}%`,
                          background: b.margin_pct < 20 ? '#EF4444' : b.margin_pct < 40 ? '#EAB308' : '#10B981',
                        }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'waste' && (
          <>
            {loading ? (
              <div className="text-center py-16 text-white/30">Hesablanır...</div>
            ) : wasteAnalyses.length === 0 ? (
              <div className="text-center py-16 text-white/20">
                <Trash2 size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Məlumat tapılmadı</p>
              </div>
            ) : (
              <div className="space-y-4">
                {wasteAnalyses.map((a: any, i: number) => {
                  const wasteItems = a.waste_analysis?.filter((w: any) => w.waste_pct > 0) || [];
                  if (!wasteItems.length) return null;
                  return (
                    <motion.div
                      key={a.menu_item_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="rounded-2xl border p-5"
                      style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-500/15">
                            <Trash2 size={18} className="text-orange-400" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white">{a.product_name}</h3>
                            <p className="text-xs text-white/30">{a.total_servings} porsiya satılıb</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-white">{formatMoney(a.theoretical_cost_per_serving)}</p>
                          <p className="text-[10px] text-white/30">xərc/porsiya</p>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        {wasteItems.map((w: any, wi: number) => (
                          <div
                            key={wi}
                            className="flex items-center justify-between p-3 rounded-xl text-xs"
                            style={{ background: 'rgba(255,255,255,0.03)' }}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-white/70 w-28 truncate">{w.ingredient_name}</span>
                              <span className="text-white/30">
                                Nəzəri: {w.theoretical_qty} / Faktiki: {w.actual_qty}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white/30">Tullantı: {w.waste_qty}</span>
                              <span className={`font-bold ${w.waste_pct > 15 ? 'text-red-400' : w.waste_pct > 8 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                {w.waste_pct}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
