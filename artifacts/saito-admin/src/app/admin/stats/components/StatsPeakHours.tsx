'use client';

import React, { useMemo, useState } from 'react';
import { Clock } from '@/components/ui/saito-icons';

interface HourPoint {
  hour: number;
  orders: number;
  revenue: number;
}

interface StatsPeakHoursProps {
  hourlyBreakdown: HourPoint[];
  peakHour: string;
  loading?: boolean;
}

const fmtManat = (v: number) =>
  v.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₼';

const fmtHour = (h: number) => {
  const hh = h % 24;
  return `${String(hh).padStart(2, '0')}:00`;
};

// 11g: `peakHour` (top-banner duplicate) is no longer rendered — the peak
// callout inside the chart is the single source. Prop stays in the interface
// for the existing caller; it is intentionally not destructured.
export default function StatsPeakHours({ hourlyBreakdown, loading }: StatsPeakHoursProps) {
  const [metric, setMetric] = useState<'orders' | 'revenue'>('orders');

  const points: HourPoint[] = useMemo(() => {
    // Normalize to a full 24h series (fallback when the API predates hourlyBreakdown).
    const base: HourPoint[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
    (hourlyBreakdown || []).forEach((p) => {
      if (p && Number.isFinite(p.hour) && p.hour >= 0 && p.hour < 24) {
        base[p.hour].orders = p.orders || 0;
        base[p.hour].revenue = p.revenue || 0;
      }
    });
    return base;
  }, [hourlyBreakdown]);

  const active = useMemo(() => points.filter((p) => (metric === 'orders' ? p.orders : p.revenue) > 0), [points, metric]);
  const max = useMemo(
    () => Math.max(1, ...points.map((p) => (metric === 'orders' ? p.orders : p.revenue))),
    [points, metric]
  );
  const peak = useMemo(() => {
    let best: HourPoint | null = null;
    for (const p of points) {
      const v = metric === 'orders' ? p.orders : p.revenue;
      if (v > 0 && (!best || v > (metric === 'orders' ? best.orders : best.revenue))) best = p;
    }
    return best;
  }, [points, metric]);

  return (
    <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-3xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold/15 text-gold flex items-center justify-center">
            <Clock size={20} />
          </div>
          <div>
            {/* 11g (E2E catch): 11c hardcoded white text — the title was
                INVISIBLE in light mode. Theme vars fix both modes. */}
            <h3 className="text-[var(--theme-text)] font-bold text-lg">PİK SAATLƏR</h3>
            <p className="text-sm text-[var(--theme-text-muted)]">Xidmət gününün tam paylanması · {active.length} saat aktiv</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-[var(--theme-text)]/[0.03] border border-[var(--theme-border)] rounded-full p-1">
          <button
            type="button"
            onClick={() => setMetric('orders')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors ${
              metric === 'orders' ? 'bg-gold text-black' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
            }`}
          >
            SİFARİŞ
          </button>
          <button
            type="button"
            onClick={() => setMetric('revenue')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors ${
              metric === 'revenue' ? 'bg-gold text-black' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
            }`}
          >
            GƏLİR
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-white/10 border-t-gold animate-spin" />
        </div>
      ) : (
        <>
          {/* Full 24h timeline */}
          <div className="flex items-end gap-[3px] h-40">
            {points.map((p) => {
              const v = metric === 'orders' ? p.orders : p.revenue;
              const hPct = Math.max(v > 0 ? 4 : 2, (v / max) * 100);
              const isPeak = peak?.hour === p.hour;
              return (
                <div
                  key={p.hour}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                  title={`${fmtHour(p.hour)} — ${v > 0 ? (metric === 'orders' ? `${p.orders} sifariş` : fmtManat(p.revenue)) : '—'}${isPeak ? ' · PİK' : ''}`}
                >
                  {/* 11g: bars were white-alpha (invisible on the light card) —
                      theme-text + opacity renders in both modes; peak stays gold. */}
                  <div
                    className={`w-full rounded-t-sm transition-all duration-300 ${isPeak ? 'bg-gold' : ''}`}
                    style={{
                      height: `${hPct}%`,
                      ...(isPeak ? {} : { background: 'var(--theme-text)', opacity: v === 0 ? 0.08 : 0.35 }),
                    }}
                  />
                </div>
              );
            })}
          </div>
          {/* Hour labels every 2h */}
          <div className="flex gap-[3px] mt-2">
            {points.map((p) => (
              <div key={p.hour} className="flex-1 text-center text-[9px] text-[var(--theme-text-muted)] tabular-nums">
                {p.hour % 2 === 0 ? String(p.hour).padStart(2, '0') : ''}
              </div>
            ))}
          </div>

          {/* Peak callout */}
          {peak ? (
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-gold/[0.07] border border-gold/20 px-4 py-3">
                <div className="text-sm text-[var(--theme-text-muted)]">
                  <span className="text-gold font-semibold">Pik saat:</span> {fmtHour(peak.hour)}
                </div>
                <div className="text-sm font-semibold text-[var(--theme-text)] tabular-nums">
                  {metric === 'orders' ? `${peak.orders} sifariş` : fmtManat(peak.revenue)}
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center justify-center rounded-2xl bg-[var(--theme-text)]/[0.03] border border-[var(--theme-border)] px-4 py-3">
                <p className="text-sm text-[var(--theme-text-muted)]">Bu dövr üçün aktiv saat yoxdur</p>
              </div>
            )}

          {/* Top-3 list (same data, list form) */}
          {active.length > 0 && (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {active.slice(0, 3).map((p, i) => (
                <div key={p.hour} className="rounded-xl bg-[var(--theme-text)]/[0.03] border border-[var(--theme-border)] px-3.5 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)]">
                    #{i + 1} · {fmtHour(p.hour)}
                  </p>
                  <p className="text-sm font-semibold text-[var(--theme-text)] tabular-nums mt-0.5">
                    {metric === 'orders' ? `${p.orders} sifariş` : fmtManat(p.revenue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
