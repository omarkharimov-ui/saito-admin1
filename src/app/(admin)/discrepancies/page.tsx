'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Search, CheckCircle, X, RefreshCw, DollarSign, Package, TrendingDown, Scale, FileWarning } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';
import type { DiscrepancyAlert } from '@/types/inventory';

const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Kritik', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  high: { label: 'Yüksək', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  medium: { label: 'Orta', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  low: { label: 'Aşağı', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
};

const typeIcons: Record<string, any> = {
  invoice_amount: DollarSign,
  received_qty: Package,
  stock_vs_sales: Scale,
  recipe_vs_actual: TrendingDown,
  supplier_price: FileWarning,
  waste_vs_norm: AlertTriangle,
  margin_drop: TrendingDown,
};

const typeLabels: Record<string, string> = {
  invoice_amount: 'Faktura Məbləği',
  received_qty: 'Qəbul Miqdarı',
  stock_vs_sales: 'Stok vs Satış',
  recipe_vs_actual: 'Resept vs Faktiki',
  supplier_price: 'Tədarükçü Qiyməti',
  waste_vs_norm: 'Tullantı Norması',
  margin_drop: 'Marja Düşməsi',
};

export default function DiscrepanciesPage() {
  const [alerts, setAlerts] = useState<DiscrepancyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [runningCheck, setRunningCheck] = useState(false);

  useEffect(() => { fetchAlerts(); }, []);

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/discrepancies');
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const runCheck = async () => {
    setRunningCheck(true);
    try {
      await fetch('/api/discrepancies', { method: 'POST' });
      await fetchAlerts();
    } catch { /* ignore */ }
    setRunningCheck(false);
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      await fetch('/api/discrepancies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      fetchAlerts();
    } catch { /* ignore */ }
  };

  const filtered = alerts.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = !filterSeverity || a.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  const openAlerts = alerts.filter(a => a.status === 'open').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status === 'open').length;

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Uyğunsuzluq Deteksiyası</h1>
            <p className="text-sm text-white/40 mt-1">AI Discrepancy Detection — Multi-source alert system</p>
          </div>
          <button
            onClick={runCheck}
            disabled={runningCheck}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center gap-2"
            style={{ background: '#D4AF37', color: '#000' }}
          >
            <RefreshCw size={14} className={runningCheck ? 'animate-spin' : ''} />
            {runningCheck ? 'Yoxlanılır...' : 'Yoxla'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Açiq Alert</p>
            <p className="text-xl font-bold text-white">{openAlerts}</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Kritik</p>
            <p className={`text-xl font-bold ${criticalAlerts > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{criticalAlerts}</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Təsdiqlənmiş</p>
            <p className="text-xl font-bold text-white">{alerts.filter(a => a.status === 'acknowledged').length}</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Həll Edilmiş</p>
            <p className="text-xl font-bold text-white">{alerts.filter(a => a.status === 'resolved').length}</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
              placeholder="Alert axtar..."
            />
          </div>
          {['critical', 'high', 'medium', 'low'].map(s => (
            <button
              key={s}
              onClick={() => setFilterSeverity(filterSeverity === s ? null : s)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${severityConfig[s].bg} ${filterSeverity === s ? 'ring-1 ring-white/20' : ''}`}
            >
              {severityConfig[s].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-white/30">Yüklənir...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-white/20">
            <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400/50" />
            <p className="text-sm">Heç bir uyğunsuzluq tapılmadı</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a, i) => {
              const cfg = severityConfig[a.severity] || severityConfig.medium;
              const Icon = typeIcons[a.type] || AlertTriangle;
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-2xl border p-5"
                  style={{
                    borderColor: a.status === 'open' ? 'var(--theme-border, rgba(255,255,255,0.06))' : 'rgba(255,255,255,0.03)',
                    opacity: a.status === 'resolved' ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        a.severity === 'critical' ? 'bg-red-500/15' :
                        a.severity === 'high' ? 'bg-orange-500/15' : 'bg-white/[0.04]'
                      }`}>
                        <Icon size={18} className={cfg.color} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{a.title}</h3>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">
                          {typeLabels[a.type] || a.type}
                          {a.source_table && ` • ${a.source_table}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${a.variance_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {a.variance_pct > 0 ? '+' : ''}{a.variance_pct}%
                      </p>
                    </div>
                  </div>

                  {a.description && (
                    <p className="text-xs text-white/50 mb-3">{a.description}</p>
                  )}

                  <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                    <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Faktiki</p>
                      <p className="text-white font-semibold">{a.value?.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Gözlənilən</p>
                      <p className="text-white font-semibold">{a.expected_value?.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-white/30">Fərq</p>
                      <p className={`font-semibold ${a.variance_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {a.variance_pct > 0 ? '+' : ''}{a.variance_pct}%
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {a.status === 'open' && (
                      <>
                        <button
                          onClick={() => handleStatus(a.id, 'acknowledged')}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}
                        >
                          <CheckCircle size={11} className="inline mr-1" /> Təsdiq Et
                        </button>
                        <button
                          onClick={() => handleStatus(a.id, 'resolved')}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                          style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}
                        >
                          <CheckCircle size={11} className="inline mr-1" /> Həll Et
                        </button>
                      </>
                    )}
                    {a.status === 'acknowledged' && (
                      <button
                        onClick={() => handleStatus(a.id, 'resolved')}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                        style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}
                      >
                        <CheckCircle size={11} className="inline mr-1" /> Həll Et
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
