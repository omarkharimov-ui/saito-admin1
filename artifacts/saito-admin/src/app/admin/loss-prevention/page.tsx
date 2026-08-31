'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, TrendingDown, TrendingUp, DollarSign,
  ShoppingBag, RotateCcw, Tag, Ban, Download,
  Shield, Users, Clock, Filter, ArrowUpRight
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import { PageTransition, PageHeader } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';

interface Anomaly {
  staff_id: string;
  staff_name: string;
  risk_score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  anomalies: Array<{
    type: string;
    label: string;
    value: number;
    baseline: number;
    severity: 'info' | 'warning' | 'danger';
    description: string;
  }>;
}

const LEVEL_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  low: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'LOW' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'MEDIUM' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'HIGH' },
  critical: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', label: 'CRITICAL' },
};

const TYPE_ICONS: Record<string, any> = {
  voids: Ban,
  refunds: RotateCcw,
  discounts: Tag,
  overrides: DollarSign,
  cash_shortage: TrendingDown,
  no_shift: Clock,
};

export default function LossPreventionPage() {
  const { t } = useLanguage();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [filterLevel, setFilterLevel] = useState('all');

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/anomalies?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setAnomalies(data.anomalies || []);
      }
    } catch {
      toast.error('Failed to load anomalies');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnomalies();
    const interval = setInterval(fetchAnomalies, 60000);
    return () => clearInterval(interval);
  }, [fetchAnomalies]);

  const filtered = useMemo(() => {
    if (filterLevel === 'all') return anomalies;
    return anomalies.filter(a => a.level === filterLevel);
  }, [anomalies, filterLevel]);

  const summary = useMemo(() => {
    const total = anomalies.length;
    const critical = anomalies.filter(a => a.level === 'critical').length;
    const high = anomalies.filter(a => a.level === 'high').length;
    const medium = anomalies.filter(a => a.level === 'medium').length;
    const totalAnomalyCount = anomalies.reduce((sum, a) => sum + a.anomalies.length, 0);
    return { total, critical, high, medium, totalAnomalyCount };
  }, [anomalies]);

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = ['Staff', 'Risk Score', 'Level', 'Anomaly Type', 'Value', 'Baseline', 'Description'];
    const rows: string[][] = [];
    for (const a of filtered) {
      for (const anomaly of a.anomalies) {
        rows.push([
          a.staff_name,
          String(a.risk_score),
          a.level,
          anomaly.label,
          String(anomaly.value),
          String(anomaly.baseline),
          anomaly.description,
        ]);
      }
    }
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `loss_prevention_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  return (
    <PageTransition className="min-h-screen p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <PageHeader
          icon={<Shield size={18} className="text-rose-400" />}
          title="Loss Prevention"
          subtitle="Anomaly detection and risk monitoring"
        />
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 text-xs font-bold uppercase tracking-widest"
        >
          <Download size={14} /> Export
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <GlassCard intensity="light" padding="md" className="border-rose-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400/60">Flagged Staff</p>
          <p className="text-lg font-black text-rose-400 tabular-nums mt-1">{summary.total}</p>
        </GlassCard>
        <GlassCard intensity="light" padding="md" className="border-rose-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400/60">Critical</p>
          <p className="text-lg font-black text-rose-400 tabular-nums mt-1">{summary.critical}</p>
        </GlassCard>
        <GlassCard intensity="light" padding="md" className="border-orange-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/60">High</p>
          <p className="text-lg font-black text-orange-400 tabular-nums mt-1">{summary.high}</p>
        </GlassCard>
        <GlassCard intensity="light" padding="md" className="border-amber-500/15">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/60">Medium</p>
          <p className="text-lg font-black text-amber-400 tabular-nums mt-1">{summary.medium}</p>
        </GlassCard>
        <GlassCard intensity="light" padding="md" className="border-white/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Total Anomalies</p>
          <p className="text-lg font-black text-white tabular-nums mt-1">{summary.totalAnomalyCount}</p>
        </GlassCard>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(['today', 'week', 'month'] as const).map(d => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${
                period === d
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'text-white/30 hover:text-white/60 border border-transparent'
              }`}
            >
              {d === 'today' ? 'Bugün' : d === 'week' ? 'Həftə' : 'Ay'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {['all', 'critical', 'high', 'medium', 'low'].map(level => (
            <button
              key={level}
              onClick={() => setFilterLevel(level)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${
                filterLevel === level
                  ? 'bg-rose-500/15 border border-rose-500/25 text-rose-300'
                  : 'text-white/40 hover:text-white/70 border border-transparent'
              }`}
            >
              {level === 'all' ? 'Hamısı' : level.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading && filtered.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Shield size={32} className="text-white/10 mx-auto mb-3" />
          <p className="text-sm font-bold text-white/30">No anomalies detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((staffAnomaly, idx) => {
              const config = LEVEL_CONFIG[staffAnomaly.level] || LEVEL_CONFIG.low;
              return (
                <motion.div
                  key={staffAnomaly.staff_id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  className={`rounded-2xl border p-5 ${config.border} ${config.bg}`}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${config.bg} ${config.border}`}>
                        <AlertTriangle size={20} className={config.color} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">{staffAnomaly.staff_name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${config.bg} ${config.color} ${config.border}`}>
                            {config.label}
                          </span>
                          <span className="text-[10px] text-white/40 font-mono">
                            Risk: {staffAnomaly.risk_score}/100
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black tabular-nums text-white">{staffAnomaly.anomalies.length}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">flags</p>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {staffAnomaly.anomalies.map((anomaly, aIdx) => {
                      const Icon = TYPE_ICONS[anomaly.type] || AlertTriangle;
                      const severityColor = anomaly.severity === 'danger' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : anomaly.severity === 'warning' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                      return (
                        <motion.div
                          key={aIdx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: aIdx * 0.05 }}
                          className={`flex items-center justify-between p-3 rounded-xl border ${severityColor}`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon size={14} />
                            <div>
                              <p className="text-xs font-bold text-white">{anomaly.label}</p>
                              <p className="text-[10px] text-white/50">{anomaly.description}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black tabular-nums text-white">{anomaly.value}</p>
                            <p className="text-[10px] text-white/40">vs {anomaly.baseline} baseline</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </PageTransition>
  );
}
