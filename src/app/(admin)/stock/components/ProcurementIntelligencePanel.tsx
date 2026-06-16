'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, BrainCircuit, LineChart, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';

type IntelligenceData = {
  supplierScores: Array<{
    supplierId?: string;
    supplierName: string;
    score: number;
    invoiceCount?: number;
    receiptCount?: number;
    unresolvedCount?: number;
    duplicateCount?: number;
    criticalCount?: number;
    onTimeRate?: number;
    quantityAccuracyRate?: number;
    priceStabilityRate?: number;
    riskLevel?: string;
    latestInvoiceNumber?: string | null;
    latestInvoiceAmount?: number | null;
  }>;
  anomalies: Array<{
    id?: string;
    title?: string;
    anomaly_type?: string;
    severity?: string;
    status?: string;
    description?: string;
    expected_value?: number | null;
    actual_value?: number | null;
    delta_value?: number | null;
  }>;
  reorderSuggestions: Array<{
    ingredientId?: string;
    ingredientName: string;
    currentStock?: number;
    criticalLimit?: number;
    suggestedQuantity?: number;
    urgency?: string;
    confidence?: number;
    monthlyWasteCost?: number;
    reason?: string;
  }>;
  recipeInsights: Array<{
    ingredientId?: string;
    ingredientName: string;
    recipeUsage?: number;
    currentStock?: number;
    pressure?: number;
    flag?: string;
    suggestion?: string;
  }>;
  statusSummary?: {
    supplierCount?: number;
    activeSuppliers?: number;
    invoiceCount?: number;
    openInvoiceCount?: number;
    draftInvoiceCount?: number;
    reviewRequiredInvoiceCount?: number;
    receiptCount?: number;
    openAnomalies?: number;
    criticalAnomalies?: number;
    reorderSuggestions?: number;
    anomalyCountsByType?: Record<string, number>;
  };
};

export function ProcurementIntelligencePanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IntelligenceData | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/inventory/procurement/intelligence', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Intelligence load failed');
        if (alive) setData(json);
      } catch (error: any) {
        if (alive) toast.error(error?.message || 'Procurement intelligence yüklənmədi');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => ({
    suppliers: data?.statusSummary?.supplierCount ?? data?.supplierScores?.length ?? 0,
    openInvoices: data?.statusSummary?.openInvoiceCount ?? 0,
    anomalies: data?.statusSummary?.openAnomalies ?? data?.anomalies?.length ?? 0,
    reorder: data?.statusSummary?.reorderSuggestions ?? data?.reorderSuggestions?.length ?? 0,
    recipes: data?.recipeInsights?.length || 0,
  }), [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Təchizatçı', value: loading ? '...' : stats.suppliers, icon: <ShieldCheck size={16} /> },
          { label: 'Açıq faktura', value: loading ? '...' : stats.openInvoices, icon: <FileText size={16} /> },
          { label: 'Anomaliya', value: loading ? '...' : stats.anomalies, icon: <AlertTriangle size={16} /> },
          { label: 'Sifariş təklifi', value: loading ? '...' : stats.reorder, icon: <RefreshCw size={16} /> },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-2">
              <span>{card.label}</span>
              {card.icon}
            </div>
            <div className="text-2xl font-semibold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2 mb-4">
            <BrainCircuit size={16} className="text-slate-900" />
            <h3 className="text-sm font-semibold text-slate-900">Supplier scoring</h3>
          </div>
          <div className="space-y-3">
            {(data?.supplierScores?.length ? data.supplierScores : [{ supplierName: 'Hələ data yoxdur', score: 0, invoiceCount: 0, receiptCount: 0, unresolvedCount: 0, duplicateCount: 0, criticalCount: 0, onTimeRate: 0, quantityAccuracyRate: 0, priceStabilityRate: 0, riskLevel: 'watch' }]).map((item, idx) => (
              <motion.div
                key={`${item.supplierName}-${idx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-black/5 bg-slate-50/80 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.supplierName}</p>
                    <p className="text-xs text-slate-500">Invoices {item.invoiceCount ?? 0} · Receipts {item.receiptCount ?? 0} · Open issues {item.unresolvedCount ?? 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-900">{Math.round(item.score || 0)}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{item.riskLevel || 'score'}</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.max(0, Math.min(100, item.score || 0))}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  <span>On time {Math.round(item.onTimeRate || 0)}%</span>
                  <span>Accuracy {Math.round(item.quantityAccuracyRate || 0)}%</span>
                  <span>Stability {Math.round(item.priceStabilityRate || 0)}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-slate-900" />
            <h3 className="text-sm font-semibold text-slate-900">Risk & recommendations</h3>
          </div>
          <div className="space-y-3">
            {(data?.anomalies?.length ? data.anomalies : [{ title: 'Hələ anomaly yoxdur', description: 'Yeni mismatch çıxanda burada görünəcək.' }]).map((item, idx) => (
              <div key={`${item.title || item.anomaly_type || idx}`} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                <p className="text-sm font-medium text-amber-900">{item.title || item.anomaly_type || 'Uyğunsuzluq'}</p>
                <p className="text-xs text-amber-800/80 mt-1">{item.description || 'Manual yoxlama tələb edir.'}</p>
                {(item.expected_value !== undefined || item.actual_value !== undefined || item.delta_value !== undefined) ? (
                  <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-amber-700/70">
                    expected {item.expected_value ?? '—'} · actual {item.actual_value ?? '—'} · delta {item.delta_value ?? '—'}
                  </p>
                ) : null}
              </div>
            ))}
            {(data?.reorderSuggestions?.length ? data.reorderSuggestions : [{ ingredientName: 'Hələ reorder təklifi yoxdur', reason: 'Satış və stok siqnalları toplandıqda çıxacaq.' }]).slice(0, 3).map((item, idx) => (
              <div key={`${item.ingredientName}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">{item.ingredientName}</p>
                <p className="text-xs text-slate-500 mt-1">{item.reason || 'Ağıllı stok təklifi'}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  qty {item.suggestedQuantity ?? '—'} · confidence {Math.round(item.confidence || 0)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 mb-4">
          <LineChart size={16} className="text-slate-900" />
          <h3 className="text-sm font-semibold text-slate-900">Recipe pressure</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.recipeInsights?.length ? data.recipeInsights : [{ ingredientName: 'Hələ insight yoxdur', suggestion: 'Reçetə, satış və stok tarixçəsi yığıldıqca çıxacaq.' }]).map((item, idx) => (
            <div key={`${item.ingredientName}-${idx}`} className="rounded-2xl border border-black/5 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">{item.ingredientName}</p>
              <p className="text-xs text-slate-500 mt-1">{item.suggestion || 'Reçetə analizi'}</p>
              <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
                <span>pressure</span>
                <span>{Math.round((item.pressure || 0) * 100)}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-rose-500" style={{ width: `${Math.max(0, Math.min(100, (item.pressure || 0) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
