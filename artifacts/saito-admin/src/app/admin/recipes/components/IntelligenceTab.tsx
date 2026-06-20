'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, TrendingUp, DollarSign, BarChart3, RefreshCw, Sparkles } from 'lucide-react';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import { SummaryCards } from '@/components/ProcurementSummaryCards';
import type { DishMarginBreakdown, RecipeIntelligence } from '@/types/inventory';

type IntelTab = 'margin' | 'waste';

export default function IntelligenceTab() {
  const [tab, setTab] = useState<IntelTab>('margin');
  const [marginData, setMarginData] = useState<DishMarginBreakdown[]>([]);
  const [wasteData, setWasteData] = useState<RecipeIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'margin' | 'profit' | 'potential'>('margin');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchMargin(), fetchWaste()]);
    setLoading(false);
  };

  const fetchMargin = async () => {
    try { setMarginData(await (await fetch('/api/recipes/margin-analysis')).json()); } catch {}
  };

  const fetchWaste = async () => {
    try { setWasteData(await (await fetch('/api/recipes/intelligence')).json()); } catch {}
  };

  const potRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sortedMargins = [...marginData]
    .filter(m => m.product_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'margin') return (a.margin_pct || 0) - (b.margin_pct || 0);
      if (sortBy === 'profit') return (b.monthly_profit || 0) - (a.monthly_profit || 0);
      return (potRank[b.optimization_potential] || 0) - (potRank[a.optimization_potential] || 0);
    });

  const filteredWaste = wasteData.filter(w =>
    w.product_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['margin', 'waste'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === t ? 'bg-white/10 text-white border border-white/15' : 'text-white/30 hover:text-white/60 border border-transparent'}`}>
            {t === 'margin' ? 'Marja Analizi' : 'Tullantı Analizi'}
          </button>
        ))}
        <button onClick={fetchData} className="ml-auto p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white/60 transition-all">
          <RefreshCw size={14} />
        </button>
      </div>

      {tab === 'margin' && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                placeholder="Məhsul axtar..." />
            </div>
            <div className="flex gap-2">
              {(['margin', 'profit', 'potential'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${sortBy === s ? 'bg-white/10 text-white border border-white/15' : 'text-white/30 hover:text-white/60 border border-transparent'}`}>
                  {s === 'margin' ? 'Marja' : s === 'profit' ? 'Gəlir' : 'Potensial'}
                </button>
              ))}
            </div>
          </div>

          <SummaryCards items={[
            { key: 'total', icon: <BarChart3 size={16} className="text-white/60" />, label: 'Məhsul', value: marginData.length },
            { key: 'avg', icon: <TrendingUp size={16} className="text-white/60" />, label: 'Orta Marja', value: `${(marginData.reduce((a, m) => a + (m.margin_pct || 0), 0) / Math.max(marginData.length, 1)).toFixed(1)}%` },
            { key: 'profit', icon: <DollarSign size={16} className="text-white/60" />, label: 'Aylıq Gəlir', value: `₼${marginData.reduce((a, m) => a + (m.monthly_profit || 0), 0).toFixed(2)}` },
          ]} />

          <div className="space-y-2">
            {sortedMargins.length === 0 ? (
              <EmptyState title="Məlumat tapılmadı" />
            ) : (
              sortedMargins.map((m, i) => (
                <motion.div key={m.menu_item_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{m.product_name}</h3>
                      <p className="text-xs text-white/30 mt-0.5">{m.monthly_units_sold} satış · {m.cost_drivers?.length ? `Kosdriver: ${m.cost_drivers.slice(0, 2).map(d => d.ingredient_name).join(', ')}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${(m.margin_pct || 0) >= 50 ? 'text-emerald-400' : (m.margin_pct || 0) >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {m.margin_pct?.toFixed(1)}%
                      </p>
                      <p className="text-xs text-white/30">₼{m.monthly_profit?.toFixed(2)}/ay</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-white/25 mb-2">
                    <span>Qiymət: ₼{m.selling_price?.toFixed(2)}</span>
                    <span>·</span>
                    <span>Xərc: ₼{m.cost_price?.toFixed(2)}</span>
                    {m.optimization_potential === 'high' && <Sparkles size={10} className="text-amber-400" />}
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(m.margin_pct || 0, 100)}%`,
                      background: (m.margin_pct || 0) >= 50 ? '#34D399' : (m.margin_pct || 0) >= 30 ? '#FBBF24' : '#EF4444',
                    }} />
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'waste' && (
        <>
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
              placeholder="Məhsul axtar..." />
          </div>

          <div className="space-y-2">
            {filteredWaste.length === 0 ? (
              <EmptyState title="Heç bir tullantı məlumatı yoxdur" />
            ) : (
              filteredWaste.map((w, i) => (
                <motion.div key={w.menu_item_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-white">{w.product_name}</h3>
                    <span className={`text-xs font-bold ${w.cost_variance_pct > 20 ? 'text-red-400' : w.cost_variance_pct > 10 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {w.cost_variance_pct?.toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Nəzəri xərc/ pors.</p>
                      <p className="text-white font-semibold">₼{w.theoretical_cost_per_serving?.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Faktiki xərc/ pors.</p>
                      <p className="text-white font-semibold">₼{w.actual_cost_per_serving?.toFixed(2)}</p>
                    </div>
                  </div>
                  {w.waste_analysis && w.waste_analysis.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {w.waste_analysis.slice(0, 3).map(wa => (
                        <div key={wa.ingredient_name} className="flex items-center gap-2 text-[11px] text-white/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400/50" />
                          {wa.ingredient_name}: nəz.{wa.theoretical_qty.toFixed(1)} fakt.{wa.actual_qty.toFixed(1)} ({wa.waste_pct.toFixed(0)}%)
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
