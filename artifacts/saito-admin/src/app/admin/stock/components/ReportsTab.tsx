'use client';

// 13c — the "Report" view (Toast COGS/AvT/shrinkage parity, premium layout):
// valuation hero + daily COGS bars + AvT (actual vs theoretical) table +
// shrinkage leaders + freshness (batches nearing expiry). One fetch
// (/api/inventory/reports), deterministic numbers — the AI advisor
// (separate card) narrates them.
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, TrendingDown, TrendingUp, Clock, AlertTriangle } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';

interface Report {
  days: number;
  valuation: { total_value: number; currency: string; ingredient_count: number; negatives: { id: string; name: string; stock: number; unit: string }[] };
  cogs: { total_cogs: number; total_waste: number; by_day: { date: string; cogs: number; waste: number }[] };
  avt: { id: string; name: string; unit: string; theoretical: number; actual: number; variance: number; variance_pct: number | null }[];
  shrinkage: { id: string; name: string; unit: string; qty: number; cost: number }[];
  /** 13d: 28-day waste PATTERN (Toast "track patterns of missing value"). */
  shrinkage_pattern: {
    window_days: number;
    total_cost: number;
    weeks: { start: string; cost: number; qty: number }[];
    week_over_week_pct: number | null;
    by_weekday: { cost: number }[];
    top: { id: string; name: string; unit: string; cost: number; qty: number; trend_pct: number | null }[];
  } | null;
  freshness: { expiring: { id: string; name: string; unit: string; qty: number; expiry_date: string; expired: boolean }[]; batches_total: number };
}

const WEEKDAY_AZ = ['B.e', 'Çax', 'Ç', 'Cax', 'C', 'Ş', 'B'];

function Card({ title, icon, children, sub }: { title: string; icon?: React.ReactNode; children: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">{title}</h3>
        </div>
        {sub && <span className="text-[10px] text-[var(--theme-text-muted)] font-bold">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ReportsTab() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/reports?days=30');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setReport(d);
    } catch (e: any) {
      toast.error(e.message || 'Report yüklənə bilmədi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !report) {
    return <div className="flex items-center justify-center py-20 text-[var(--theme-text-muted)]"><Loader2 size={22} className="animate-spin" /></div>;
  }

  const maxDay = Math.max(1, ...report.cogs.by_day.map(d => d.cogs + d.waste));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Son {report.days} gün · inventory analitiki</p>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-[var(--theme-panel)] hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] transition-all border border-[var(--theme-border)]">
          <RefreshCw size={13} /> Yenilə
        </button>
      </div>

      {/* valuation hero */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.03] border border-emerald-500/25 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80">Cari Stok Dəyəri</p>
          <p className="text-4xl font-black text-[var(--theme-text)] tabular-nums mt-2">
            {report.valuation.total_value.toLocaleString('az')} <span className="text-lg text-[var(--theme-text-muted)]">{report.valuation.currency}</span>
          </p>
          <p className="text-[11px] text-[var(--theme-text-muted)] mt-2 font-medium">{report.valuation.ingredient_count} maddə × orta qiymət</p>
        </div>
        <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">COGS (satış sərfiyyatı)</p>
          <p className="text-3xl font-black text-[var(--theme-text)] tabular-nums mt-2">
            {report.cogs.total_cogs.toLocaleString('az')} <span className="text-base text-[var(--theme-text-muted)]">₼</span>
          </p>
          <p className="text-[11px] text-[var(--theme-text-muted)] mt-2 font-medium flex items-center gap-1">
            <TrendingDown size={12} className="text-rose-400" /> itki: {report.cogs.total_waste.toLocaleString('az')} ₼
          </p>
        </div>
        <div className={`rounded-3xl border p-6 ${report.valuation.negatives.length > 0 ? 'bg-rose-500/[0.06] border-rose-500/30' : 'bg-[var(--theme-surface)] border-[var(--theme-border)]'}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Nəfs Stok Borcu</p>
          {report.valuation.negatives.length > 0 ? (
            <>
              <p className="text-3xl font-black text-rose-400 tabular-nums mt-2">{report.valuation.negatives.length}</p>
              <div className="mt-2 space-y-1 max-h-16 overflow-y-auto">
                {report.valuation.negatives.slice(0, 4).map(n => (
                  <p key={n.id} className="text-[11px] font-bold text-rose-400/90 truncate">• {n.name}: {n.stock} {n.unit}</p>
                ))}
                {report.valuation.negatives.length > 4 && <p className="text-[10px] text-rose-400/50">+{report.valuation.negatives.length - 4} daha → sayım lazımdır</p>}
              </div>
            </>
          ) : (
            <p className="text-3xl font-black text-emerald-400 mt-2">0</p>
          )}
        </div>
      </div>

      {/* daily bars */}
      <Card title="Gündəlik COGS + İtki" sub="30 gün">
        {report.cogs.by_day.length === 0 ? (
          <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">Bu dövrdə sərfiyyat qeydi yoxdur.</p>
        ) : (
          <div className="flex items-end gap-1 h-28">
            {report.cogs.by_day.map(d => (
              <div key={d.date} className="flex-1 flex flex-col justify-end gap-px group relative h-full" title={`${d.date} — COGS ${d.cogs} ₼, itki ${d.waste} ₼`}>
                <div className="rounded-t-sm bg-emerald-500/70" style={{ height: `${(d.cogs / maxDay) * 100}%`, minHeight: d.cogs > 0 ? 3 : 0 }} />
                <div className="bg-rose-500/70" style={{ height: `${(d.waste / maxDay) * 100}%`, minHeight: d.waste > 0 ? 2 : 0 }} />
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--theme-text)]/45 font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" /> COGS</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--theme-text)]/45 font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500/70" /> İtki</span>
        </div>
      </Card>

      {/* 13d: shrinkage pattern (28g) — weeks, weekday heat, top drivers w/ trend */}
      {report.shrinkage_pattern && (
        <Card title="İtki Pattern" sub="28 gün · həftəlik" icon={<TrendingDown size={13} className="text-rose-400" />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* weekly totals */}
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--theme-text-muted)]">Həftələr</p>
              {report.shrinkage_pattern.weeks.map((w, i) => (
                <div key={w.start} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[var(--theme-text-muted)] font-bold">H{i + 1} · {new Date(w.start).toLocaleDateString('az', { day: 'numeric', month: 'short' })}</span>
                  <span className={`tabular-nums font-black ${i === 3 ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text)]/55'}`}>{w.cost.toLocaleString('az')} ₼</span>
                </div>
              ))}
              <div className="pt-1.5 border-t border-[var(--theme-border)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--theme-text-muted)] font-bold">Toplam</span>
                <span className="tabular-nums font-black text-rose-400">{report.shrinkage_pattern.total_cost.toLocaleString('az')} ₼</span>
              </div>
              {report.shrinkage_pattern.week_over_week_pct != null && (
                <p className={`flex items-center gap-1.5 text-[11px] font-black ${report.shrinkage_pattern.week_over_week_pct > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {report.shrinkage_pattern.week_over_week_pct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  keçən həftəyə {report.shrinkage_pattern.week_over_week_pct > 0 ? '+' : ''}{report.shrinkage_pattern.week_over_week_pct}%
                </p>
              )}
            </div>
            {/* weekday heat */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--theme-text-muted)] mb-2">Gün paylanması</p>
              <div className="flex items-end gap-1.5 h-24">
                {report.shrinkage_pattern.by_weekday.map((d, i) => {
                  const max = Math.max(1, ...report.shrinkage_pattern!.by_weekday.map(x => x.cost));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${WEEKDAY_AZ[i]}: ${d.cost} ₼`}>
                      <div className="w-full rounded-t-md bg-rose-500/60" style={{ height: `${(d.cost / max) * 100}%`, minHeight: d.cost > 0 ? 3 : 0 }} />
                      <span className="text-[8px] font-bold text-[var(--theme-text-muted)]">{WEEKDAY_AZ[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* top drivers + trend */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--theme-text-muted)] mb-2">Top itkilər · trend</p>
              {report.shrinkage_pattern.top.length === 0 ? (
                <p className="text-xs text-[var(--theme-text-muted)] py-4">28 gündə itki qeydi yoxdur.</p>
              ) : (
                <div className="space-y-1.5">
                  {report.shrinkage_pattern.top.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate font-bold text-[var(--theme-text)]/75">{s.name}</span>
                      <span className="shrink-0 flex items-center gap-2 tabular-nums">
                        {s.trend_pct != null ? (
                          <span className={`flex items-center gap-0.5 font-black ${s.trend_pct > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {s.trend_pct > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{s.trend_pct > 0 ? '+' : ''}{s.trend_pct}%
                          </span>
                        ) : <span className="text-[var(--theme-text-muted)]">—</span>}
                        <b className="text-rose-400">{s.cost.toLocaleString('az')} ₼</b>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AvT */}
        <Card title="AvT — Faktiki vs Təxmin" sub="resept × satış">
          {report.avt.length === 0 ? (
            <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">Təxmin olunan sərfiyyat üçün satış+resept data-sı kifayət deyil.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {report.avt.map(r => {
                const bad = r.variance_pct != null && Math.abs(r.variance_pct) >= 15;
                return (
                  <div key={r.id} className={`flex items-center justify-between gap-3 p-3 rounded-2xl border ${bad ? 'bg-amber-500/[0.05] border-amber-500/25' : 'border-[var(--theme-border)]'}`}>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-[var(--theme-text)] truncate">{r.name}</p>
                      <p className="text-[10px] text-[var(--theme-text-muted)] tabular-nums mt-0.5">təxmin {r.theoretical} · faktiki {r.actual} {r.unit}</p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-black tabular-nums ${r.variance >= 0 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'}`}>
                      {r.variance >= 0 ? '+' : ''}{r.variance} {r.unit}{r.variance_pct != null && <span className="opacity-60"> ({r.variance_pct >= 0 ? '+' : ''}{r.variance_pct}%)</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* shrinkage + freshness */}
        <div className="space-y-4">
          <Card title="İtki Liderləri" sub="waste · 30 gün" icon={<TrendingDown size={13} className="text-rose-400" />}>
            {report.shrinkage.length === 0 ? (
              <p className="text-xs text-[var(--theme-text-muted)] py-4 text-center">İtki qeydi yoxdur — təbrik.</p>
            ) : (
              <div className="space-y-1.5">
                {report.shrinkage.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-[var(--theme-text)]/75">{s.name}</span>
                    <span className="tabular-nums text-[var(--theme-text)]/45">{s.qty} {s.unit} · <b className="text-rose-400">{s.cost.toLocaleString('az')} ₼</b></span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Tazelik (batch/expiry)" sub={`${report.freshness.batches_total} batch`} icon={<Clock size={13} className="text-amber-400" />}>
            {report.freshness.expiring.length === 0 ? (
              <p className="text-xs text-[var(--theme-text-muted)] py-4 text-center">3 gün içində bitən batch yoxdur. Batch-ləri Anbar → maddə → &ldquo;Batch&rdquo; bloğundan əlavə edin.</p>
            ) : (
              <div className="space-y-1.5">
                {report.freshness.expiring.map(b => (
                  <div key={b.id} className={`flex items-center justify-between p-2.5 rounded-xl border text-[12px] ${b.expired ? 'bg-rose-500/10 border-rose-500/30' : 'bg-amber-500/[0.05] border-amber-500/25'}`}>
                    <span className="font-bold flex items-center gap-1.5 text-[var(--theme-text-secondary)]">
                      {b.expired && <AlertTriangle size={12} className="text-rose-400" />}{b.name}
                    </span>
                    <span className={`tabular-nums font-bold ${b.expired ? 'text-rose-400' : 'text-amber-400'}`}>
                      {b.expired ? 'MÜDDƏTİ KEÇİB' : new Date(b.expiry_date).toLocaleDateString('az', { day: 'numeric', month: 'short' })} · {b.qty} {b.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
