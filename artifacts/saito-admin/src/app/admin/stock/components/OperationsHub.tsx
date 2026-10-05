'use client';

// 13i — "Sayım & İtki" tab (owner: 10 tab → 4 niyyət tab).
// Everything about "accounting for what physically happened":
//   Sayım · İtki (qeydiyyat + normalar bir yerdə) · Qaytarış · Anomaliyalar
//
// Note on İtki: the actual waste RECORDING stays on the Stok tab (row → İtki
// button — the ingredient is right there); this sub = standards (normas) +
// a clear pointer, so the user is never in the wrong place for it.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, CheckCircle, AlertTriangle, DollarSign, TrendingDown,
  Info,
} from '@/components/ui/saito-icons';
import { SPRING } from '@/lib/motion/system';
import { TableActionBar } from '@/components/TableActionBar';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import { SummaryCards } from '@/components/ProcurementSummaryCards';
import { toast } from '@/lib/toast';
import type { DiscrepancyAlert } from '@/types/inventory';
import TabHero from './TabHero';
import { ViewContent } from './ViewFrame';
import StockCountsPage from '../counts/counts-content';
import SupplierReturnsPage from '../returns/returns-content';
import WasteStandardsPage from '../../waste-standards/waste-standards-content';

const severityConfig: Record<string, { label: string; color: string; bg: string; light: string }> = {
  critical: { label: 'Kritik', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/25', light: 'bg-rose-500/10 border-rose-500/30 text-rose-600' },
  high:     { label: 'Yüksək', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/25', light: 'bg-orange-500/10 border-orange-500/30 text-orange-600' },
  medium:   { label: 'Orta',   color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25', light: 'bg-amber-500/10 border-amber-500/30 text-amber-600' },
  low:      { label: 'Aşağı',  color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/25', light: 'bg-blue-500/10 border-blue-500/30 text-blue-600' },
};

// light mode: 400-level accent text is pale on white — explicit 600-level map.
const LIGHT_SEV_COLOR: Record<string, string> = {
  critical: 'text-rose-600', high: 'text-orange-600', medium: 'text-amber-600', low: 'text-blue-600',
};

const alertTypeLabels: Record<string, string> = {
  invoice_amount: 'Faktura Məbləği', received_qty: 'Qəbul Miqdarı',
  stock_vs_sales: 'Stok vs Satış', recipe_vs_actual: 'Resept vs Faktiki',
  supplier_price: 'Tədarükçü Qiyməti', waste_vs_norm: 'Tullantı Norması',
  margin_drop: 'Marja Düşməsi',
};

interface Props {
  sub: string;
  onSubChange: (s: string) => void;
  isElevated: boolean;
  lightMode: boolean;
}

export default function OperationsHub({ sub, onSubChange, isElevated, lightMode }: Props) {
  const [openAlerts, setOpenAlerts] = useState<number | null>(null);
  const [criticalAlerts, setCriticalAlerts] = useState(0);

  // light hero fetch — the AnomaliesSection below does its own full fetch
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/discrepancies');
        const a: DiscrepancyAlert[] = Array.isArray(await r.json()) ? await r.json() : [];
        setOpenAlerts(a.filter(x => x.status === 'open').length);
        setCriticalAlerts(a.filter(x => x.severity === 'critical' && x.status === 'open').length);
      } catch { setOpenAlerts(null); }
    })();
  }, [sub]);

  const hero = openAlerts == null
    ? { tone: 'info' as const, title: 'Sayım, itkilər və uyğunsuzluqlar', sub: 'Fiziki reallığı sistemlə bərabərləşdirmək üçün.' }
    : criticalAlerts > 0
      ? { tone: 'critical' as const, title: `${criticalAlerts} kritik anomaliya açıqdır`, sub: 'Uyğunsuzluqları yoxlayıb təsdiqləyin və ya həll edin.', cta: { label: 'Anomaliyalar →', onClick: () => onSubChange('anomalies') } }
      : openAlerts > 0
        ? { tone: 'warning' as const, title: `${openAlerts} açıq anomaliya var`, sub: 'Diqqət tələb edən uyğunsuzluqlar.', cta: { label: 'Bax →', onClick: () => onSubChange('anomalies') } }
        : { tone: 'ok' as const, title: 'Hamı uyğundur', sub: 'Açıq anomaliya yoxdur — son yoxlama təmiz keçib.' };

  const pills = [
    ...(isElevated ? [{ id: 'counts', label: 'Sayım' }] : []),
    ...(isElevated ? [{ id: 'waste', label: 'İtki' }] : []),
    ...(isElevated ? [{ id: 'returns', label: 'Qaytarış' }] : []),
    { id: 'anomalies', label: 'Anomaliyalar' },
  ];

  return (
    <ViewContent id={`ops-${sub}`}>
      <div className="space-y-5">
        <TabHero tone={hero.tone} title={hero.title} sub={hero.sub} cta={'cta' in hero ? hero.cta : undefined} lightMode={lightMode} />

        <div className="flex flex-wrap gap-1 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] p-1 w-fit">
          {pills.map(p => (
            <button key={p.id} onClick={() => onSubChange(p.id)}
              className={`relative px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors ${sub === p.id ? 'text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>
              {sub === p.id && <motion.span layoutId="ops-sub-pill" className="absolute inset-0 rounded-xl bg-[var(--theme-text)]" transition={SPRING} />}
              <span className="relative z-10">{p.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {sub === 'counts' && isElevated && (
            <motion.div key="counts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <StockCountsPage />
            </motion.div>
          )}

          {sub === 'waste' && isElevated && (
            <motion.div key="waste" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING} className="space-y-4">
              {/* where the actual recording happens — the 3-second answer */}
              <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-blue-500/[0.05] border border-blue-500/20">
                <Info size={16} className={`mt-0.5 shrink-0 ${lightMode ? 'text-blue-600' : 'text-blue-400'}`} />
                <p className="text-xs leading-relaxed text-[var(--theme-text-secondary)]">
                  <b className="text-[var(--theme-text)]">İtki qeydi</b> Stok tab-ında edilir: xammal sətrindəki İtki düyməsi.
                  Burada <b className="text-[var(--theme-text)]">normalar</b> idarə olunur — sistem faktiki itkini norma ilə müqayisə edib Anomaliyalar-da göstərir.
                </p>
              </div>
              <WasteStandardsPage />
            </motion.div>
          )}

          {sub === 'returns' && isElevated && (
            <motion.div key="returns" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <SupplierReturnsPage />
            </motion.div>
          )}

          {sub === 'anomalies' && (
            <motion.div key="anomalies" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <AnomaliesSection lightMode={lightMode} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ViewContent>
  );
}

/* ── Anomaliyalar (moved from the old ProcurementTab, theme-var restyle) ── */
function AnomaliesSection({ lightMode }: { lightMode: boolean }) {
  const [alerts, setAlerts] = useState<DiscrepancyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const fetchAlerts = async () => {
    try {
      const r = await fetch('/api/discrepancies');
      setAlerts(Array.isArray(await r.json()) ? await r.json() : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAlerts(); }, []);

  const runCheck = async () => {
    setRunning(true);
    try { await fetch('/api/discrepancies', { method: 'POST' }); await fetchAlerts(); toast.success('Yoxlama tamamlandı'); } catch {}
    setRunning(false);
  };

  const handleStatus = async (id: string, status: string) => {
    try { await fetch('/api/discrepancies', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); fetchAlerts(); } catch {}
  };

  const filtered = alerts.filter(a => {
    const ms = a.title.toLowerCase().includes(search.toLowerCase());
    const sf = !severityFilter || a.severity === severityFilter;
    return ms && sf;
  });

  const openAlerts = alerts.filter(a => a.status === 'open').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status === 'open').length;

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SummaryCards items={[
          { key: 'open', icon: <AlertTriangle size={16} className="text-[var(--theme-text-muted)]" />, label: 'Açıq Alert', value: openAlerts },
          { key: 'critical', icon: <AlertTriangle size={16} className={lightMode ? 'text-rose-600' : 'text-rose-400'} />, label: 'Kritik', value: criticalAlerts, accent: criticalAlerts > 0 ? (lightMode ? 'text-rose-600/80' : 'text-rose-400/70') : 'text-emerald-500' },
          { key: 'ack', icon: <CheckCircle size={16} className="text-[var(--theme-text-muted)]" />, label: 'Təsdiqlənmiş', value: alerts.filter(a => a.status === 'acknowledged').length },
          { key: 'resolved', icon: <CheckCircle size={16} className="text-[var(--theme-text-muted)]" />, label: 'Həll Edilmiş', value: alerts.filter(a => a.status === 'resolved').length },
        ]} />
        <button onClick={runCheck} disabled={running}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-40 active:scale-[0.97] bg-[var(--theme-text)] text-[var(--theme-bg)]">
          <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
          {running ? 'Yoxlanılır...' : 'Yoxla'}
        </button>
      </div>

      <TableActionBar search={search} onSearchChange={setSearch} searchPlaceholder="Alert axtar..."
        filter={severityFilter}
        filters={[{ key: 'critical', label: 'Kritik' }, { key: 'high', label: 'Yüksək' }, { key: 'medium', label: 'Orta' }, { key: 'low', label: 'Aşağı' }]}
        onFilterChange={setSeverityFilter} />

      {filtered.length === 0 ? (
        <EmptyState icon={<CheckCircle size={40} className="text-emerald-500/60" />} title="Heç bir uyğunsuzluq tapılmadı" />
      ) : (
        <div className="space-y-3">
          {filtered.map((a, i) => {
            const cfg = severityConfig[a.severity] || severityConfig.medium;
            const Icon = a.type === 'invoice_amount' || a.type === 'supplier_price' ? DollarSign : a.type === 'received_qty' ? CheckCircle : a.type === 'waste_vs_norm' ? AlertTriangle : TrendingDown;
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="rounded-2xl border bg-[var(--theme-surface)] p-5"
                style={{
                  borderColor: a.status === 'open' ? 'var(--theme-border)' : 'transparent',
                  opacity: a.status === 'resolved' ? 0.5 : 1,
                }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.severity === 'critical' ? 'bg-rose-500/15' : a.severity === 'high' ? 'bg-orange-500/15' : 'bg-[var(--theme-surface-soft)]'}`}>
                      <Icon size={18} className={lightMode ? LIGHT_SEV_COLOR[a.severity] || LIGHT_SEV_COLOR.low : cfg.color} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-[var(--theme-text)]">{a.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${lightMode ? cfg.light : `${cfg.bg} ${cfg.color}`}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{alertTypeLabels[a.type] || a.type}{a.source_table && ` • ${a.source_table}`}</p>
                    </div>
                  </div>
                  <p className={`text-lg font-black tabular-nums shrink-0 ${a.variance_pct > 0 ? (lightMode ? 'text-rose-600' : 'text-rose-400') : 'text-emerald-500'}`}>{a.variance_pct > 0 ? '+' : ''}{a.variance_pct}%</p>
                </div>
                {a.description && <p className="text-xs text-[var(--theme-text-muted)] mb-3">{a.description}</p>}
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  {[
                    { label: 'Faktiki', value: a.value?.toFixed(2), cls: '' },
                    { label: 'Gözlənilən', value: a.expected_value?.toFixed(2), cls: '' },
                    { label: 'Fərq', value: `${a.variance_pct > 0 ? '+' : ''}${a.variance_pct}%`, cls: a.variance_pct > 0 ? (lightMode ? 'text-rose-600' : 'text-rose-400') : 'text-emerald-500' },
                  ].map(c => (
                    <div key={c.label} className="p-2.5 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                      <p className="text-[var(--theme-text-muted)] mb-0.5">{c.label}</p>
                      <p className={`font-bold tabular-nums ${c.cls || 'text-[var(--theme-text)]'}`}>{c.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {a.status === 'open' && (
                    <>
                      <button onClick={() => handleStatus(a.id, 'acknowledged')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all active:scale-[0.97]">
                        <CheckCircle size={12} /> Təsdiq Et
                      </button>
                      <button onClick={() => handleStatus(a.id, 'resolved')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-[0.97]">
                        <CheckCircle size={12} /> Həll Et
                      </button>
                    </>
                  )}
                  {a.status === 'acknowledged' && (
                    <button onClick={() => handleStatus(a.id, 'resolved')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-[0.97]">
                      <CheckCircle size={12} /> Həll Et
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
