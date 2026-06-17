'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, AlertTriangle, TrendingUp, TrendingDown, Minus, Package, DollarSign, RefreshCw } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';
import type { StockSuggestion, ConsumptionTrend } from '@/types/inventory';

const urgencyColors: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  critical: { label: 'Təcili', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: AlertTriangle },
  high: { label: 'Yüksək', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', icon: AlertTriangle },
  medium: { label: 'Orta', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Package },
  low: { label: 'Normal', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: Package },
};

export default function StockSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [trends, setTrends] = useState<ConsumptionTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<string | null>(null);
  const [tab, setTab] = useState<'suggestions' | 'trends'>('suggestions');

  useEffect(() => {
    Promise.all([fetchSuggestions(), fetchTrends()]).finally(() => setLoading(false));
  }, []);

  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/api/stock/suggestions');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch { /* ignore */ }
  };

  const fetchTrends = async () => {
    try {
      const res = await fetch('/api/stock/trends');
      const data = await res.json();
      setTrends(data);
    } catch { /* ignore */ }
  };

  const filtered = suggestions.filter(s => {
    const matchesSearch = s.ingredient_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUrgency = !filterUrgency || s.urgency === filterUrgency;
    return matchesSearch && matchesUrgency;
  });

  const formatMoney = (n: number) => `${n.toFixed(2)} ₼`;

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Stok Təklifləri</h1>
            <p className="text-sm text-white/40 mt-1">Smart reorder suggestions & consumption trends</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('suggestions')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'suggestions' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'suggestions' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}
            >
              Təkliflər
            </button>
            <button
              onClick={() => setTab('trends')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'trends' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'trends' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}
            >
              Trendlər
            </button>
            <button onClick={() => { setLoading(true); Promise.all([fetchSuggestions(), fetchTrends()]).finally(() => setLoading(false)); }} className="p-2 rounded-xl bg-white/[0.05] text-white/40 hover:text-white transition-all">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
            placeholder="İnqrediyent axtar..."
          />
        </div>

        {tab === 'suggestions' && (
          <>
            <div className="flex gap-2 flex-wrap">
              {['critical', 'high', 'medium', 'low'].map(u => {
                const cfg = urgencyColors[u];
                const count = suggestions.filter(s => s.urgency === u).length;
                return (
                  <button
                    key={u}
                    onClick={() => setFilterUrgency(filterUrgency === u ? null : u)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${cfg.bg} ${filterUrgency === u ? 'ring-1 ring-white/20' : ''}`}
                  >
                    {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="text-center py-16 text-white/30">Hesablanır...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-white/20">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Təklif tapılmadı</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.map((s, i) => {
                  const cfg = urgencyColors[s.urgency];
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={s.ingredient_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="rounded-2xl border p-5"
                      style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.urgency === 'critical' || s.urgency === 'high' ? 'bg-red-500/15' : 'bg-white/[0.04]'}`}>
                            <Icon size={18} className={cfg.color} />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white">{s.ingredient_name}</h3>
                            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.bg} ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-white">{s.days_remaining > 99 ? '∞' : s.days_remaining}g</p>
                          <p className="text-[10px] text-white/30">qalıb</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                        <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <p className="text-white/30 mb-0.5">Stok</p>
                          <p className="text-white font-semibold">{s.current_stock} {s.unit}</p>
                        </div>
                        <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <p className="text-white/30 mb-0.5">Günlük sərf</p>
                          <p className="text-white font-semibold">{s.daily_consumption_rate} {s.unit}</p>
                        </div>
                        <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <p className="text-white/30 mb-0.5">Tövsiyə</p>
                          <p className="text-[#D4AF37] font-bold">{s.suggested_reorder_qty > 0 ? `${s.suggested_reorder_qty} ${s.unit}` : '—'}</p>
                        </div>
                        <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <p className="text-white/30 mb-0.5">Məbləğ</p>
                          <p className="text-white font-semibold">{formatMoney(s.estimated_reorder_cost)}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                          {s.consumption_trend === 'rising' ? <TrendingUp size={12} className="text-red-400" /> :
                           s.consumption_trend === 'falling' ? <TrendingDown size={12} className="text-emerald-400" /> :
                           <Minus size={12} />}
                          <span>Trend: {s.consumption_trend === 'rising' ? 'Artır' : s.consumption_trend === 'falling' ? 'Azalır' : 'Sabit'}</span>
                        </div>
                        <div className="text-[11px] text-white/30">Lead: {s.lead_time_days}g</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'trends' && (
          <>
            {loading ? (
              <div className="text-center py-16 text-white/30">Yüklənir...</div>
            ) : trends.length === 0 ? (
              <div className="text-center py-16 text-white/20">
                <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Məlumat tapılmadı</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {trends.filter(t => t.daily.length > 0).map((t, i) => (
                  <motion.div
                    key={t.ingredient_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="rounded-2xl border p-5"
                    style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">{t.ingredient_name}</h3>
                      <span className={`text-xs font-bold ${t.trend_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {t.trend_pct > 0 ? '+' : ''}{t.trend_pct}%
                      </span>
                    </div>

                    <div className="flex gap-2 h-16 items-end mb-3">
                      {t.daily.slice(-14).map((d, di) => {
                        const maxVal = Math.max(...t.daily.map(x => x.consumption), 1);
                        const h = (d.consumption / maxVal) * 100;
                        return (
                          <div key={di} className="flex-1 flex flex-col items-center gap-0.5">
                            <div
                              className="w-full rounded-t transition-all"
                              style={{
                                height: `${Math.max(h, 2)}%`,
                                background: t.trend_pct > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(52,211,153,0.4)',
                                minHeight: '2px',
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30">Həftəlik ort.</p>
                        <p className="text-white font-semibold">{t.weekly_avg} {t.unit}</p>
                      </div>
                      <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30">Aylıq ort.</p>
                        <p className="text-white font-semibold">{t.monthly_avg} {t.unit}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
