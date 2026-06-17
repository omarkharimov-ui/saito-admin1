'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, TrendingUp, TrendingDown, Minus, Package, Search, RefreshCw, AlertTriangle, DollarSign, CheckCircle } from 'lucide-react';
import { TableActionBar } from '@/components/TableActionBar';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import { SummaryCards } from '@/components/ProcurementSummaryCards';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { CalibrationSuggestionsPanel } from './CalibrationSuggestionsPanel';
import type { StockSuggestion, ConsumptionTrend, AIInsight } from '@/types/inventory';

type IntelTab = 'suggestions' | 'calibration' | 'trends';

export default function IntelligenceTab() {
  const [tab, setTab] = useState<IntelTab>('suggestions');
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [trends, setTrends] = useState<ConsumptionTrend[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [calibrationApplied, setCalibrationApplied] = useState(0);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchSuggestions(), fetchTrends(), fetchAIInsights()]);
    setLoading(false);
  };

  const fetchSuggestions = async () => {
    try { const r = await fetch('/api/stock/suggestions'); setSuggestions(await r.json()); } catch {}
  };

  const fetchTrends = async () => {
    try { const r = await fetch('/api/stock/trends'); setTrends(await r.json()); } catch {}
  };

  const fetchAIInsights = async () => {
    try { const r = await fetch('/api/stock/ai-insights'); setInsights(await r.json()); } catch {}
  };

  const urgencyColors: Record<string, string> = {
    critical: 'text-red-400 bg-red-500/15 border-red-500/20',
    high: 'text-orange-400 bg-orange-500/15 border-orange-500/20',
    medium: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/20',
    low: 'text-blue-400 bg-blue-500/15 border-blue-500/20',
  };

  const filteredSuggestions = suggestions.filter(s => {
    const match = s.ingredient_name.toLowerCase().includes(search.toLowerCase());
    const urgency = !urgencyFilter || s.urgency === urgencyFilter;
    return match && urgency;
  });

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['suggestions', 'calibration', 'trends'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === t ? 'bg-white/10 text-white border border-white/15' : 'text-white/30 hover:text-white/60 border border-transparent'}`}>
            {t === 'suggestions' ? 'Təkliflər' : t === 'calibration' ? 'Kalibrasiya' : 'Trendlər'}
          </button>
        ))}
        <button onClick={fetchData} className="ml-auto p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white/60 transition-all">
          <RefreshCw size={14} />
        </button>
      </div>

      {tab === 'suggestions' && (
        <>
          <SummaryCards items={[
            { key: 'total', icon: <Package size={16} className="text-white/60" />, label: 'Tövsiyələr', value: suggestions.length },
            { key: 'critical', icon: <AlertTriangle size={16} className="text-red-400" />, label: 'Kritik', value: suggestions.filter(s => s.urgency === 'critical').length, accent: 'text-red-400/70' },
            { key: 'high', icon: <AlertTriangle size={16} className="text-orange-400" />, label: 'Yüksək', value: suggestions.filter(s => s.urgency === 'high').length, accent: 'text-orange-400/70' },
            { key: 'cost', icon: <DollarSign size={16} className="text-white/60" />, label: 'Təxmini Xərc', value: `₼${suggestions.reduce((a, s) => a + (s.suggested_reorder_qty * s.avg_cost_per_unit || 0), 0).toFixed(2)}`, accent: 'text-white/20' },
          ]} />

          <TableActionBar search={search} onSearchChange={setSearch} searchPlaceholder="Xammal axtar..."
            filter={urgencyFilter} filters={[
              { key: 'critical', label: 'Kritik' },
              { key: 'high', label: 'Yüksək' },
              { key: 'medium', label: 'Orta' },
              { key: 'low', label: 'Aşağı' },
            ]} onFilterChange={setUrgencyFilter} />

          {filteredSuggestions.length === 0 ? (
            <EmptyState icon={<CheckCircle size={40} className="text-emerald-400/50" />} title="Tövsiyə tələb edən xammal yoxdur" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredSuggestions.map((s, i) => (
                <motion.div key={s.ingredient_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{s.ingredient_name}</h3>
                      <p className="text-xs text-white/30 mt-0.5">{s.current_stock} {s.unit} stokda • {s.daily_consumption_rate?.toFixed(2)}/gün</p>
                    </div>
                    <StockStatusBadge status={s.urgency} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Tövsiyə</p>
                      <p className="text-white font-semibold">{s.suggested_reorder_qty} {s.unit}</p>
                    </div>
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Qalan Gün</p>
                      <p className="text-white font-semibold">{s.days_remaining?.toFixed(0) || '—'}</p>
                    </div>
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Xərc</p>
                      <p className="text-white font-semibold">₼{(s.suggested_reorder_qty * s.avg_cost_per_unit || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'calibration' && (
        <CalibrationSuggestionsPanel
          suggestions={[]}
          onApplied={() => { setCalibrationApplied(c => c + 1); fetchSuggestions(); }}
        />
      )}

      {tab === 'trends' && (
        <div className="space-y-2">
          {trends.map(t => (
            <div key={t.ingredient_id} className="rounded-xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-white">{t.ingredient_name}</p>
                <p className="text-xs text-white/30">{t.weekly_avg?.toFixed(1)}/həftə • {t.monthly_avg?.toFixed(1)}/ay</p>
              </div>
              <div className="flex items-end gap-1 h-8">
                {(t.daily || []).slice(-14).map((d, i) => {
                  const max = Math.max(...(t.daily || []).map(x => x.consumption), 1);
                  return (
                    <div key={i} className="flex-1 rounded-t"
                      style={{
                        height: `${(d.consumption / max) * 100}%`,
                        background: d.consumption > 0 ? 'var(--theme-accent, #D4AF37)' : 'rgba(255,255,255,0.05)',
                        opacity: 0.4 + (d.consumption / max) * 0.6,
                        minHeight: 2,
                      }} />
                  );
                })}
              </div>
            </div>
          ))}
          {trends.length === 0 && <EmptyState title="Heç bir trend məlumatı yoxdur" />}
        </div>
      )}
    </div>
  );
}


