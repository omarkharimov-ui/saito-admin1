'use client';

// 13i — "Analiz" tab. Everything about "understanding what happened":
//   Hesabat (COGS/AvT/Tazelik/İtki Pattern) · Trend (30 günlük sərfiyyat) · Audit (tam tarixçə + export)
// The old "Ağıllı Analiz" tab is gone — its pieces were re-homed:
//   Təkliflər → Tədarük/Nə Alım · Kalibrasiya → Reseptlər səhifəsi · İnsaytlar → Stok/Advisor.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2 } from '@/components/ui/saito-icons';
import { SPRING } from '@/lib/motion/system';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import type { ConsumptionTrend } from '@/types/inventory';
import TabHero from './TabHero';
import { ViewContent } from './ViewFrame';
import ReportsTab from './ReportsTab';
import AuditPage from '../../audit/audit-content';

interface Props {
  sub: string;
  onSubChange: (s: string) => void;
  lightMode: boolean;
}

export default function AnalyticsHub({ sub, onSubChange, lightMode }: Props) {
  const pills = [
    { id: 'report', label: 'Hesabat' },
    { id: 'trends', label: 'Trend' },
    { id: 'audit', label: 'Audit' },
  ];

  const hero = {
    tone: 'info' as const,
    title: 'Hesabat, trend və tam tarixçə',
    sub: 'Stokun maliyyə şəklində nəzərdən keçirilməsi — COGS, AvT, təzəlik və hərəkət tarixçəsi.',
  };

  return (
    <ViewContent id={`ana-${sub}`}>
      <div className="space-y-5">
        <TabHero tone={hero.tone} title={hero.title} sub={hero.sub} lightMode={lightMode} />

        <div className="flex flex-wrap gap-1 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] p-1 w-fit">
          {pills.map(p => (
            <button key={p.id} onClick={() => onSubChange(p.id)}
              className={`relative px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors ${sub === p.id ? 'text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>
              {sub === p.id && <motion.span layoutId="ana-sub-pill" className="absolute inset-0 rounded-xl bg-[var(--theme-text)]" transition={SPRING} />}
              <span className="relative z-10">{p.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {sub === 'report' && (
            <motion.div key="report" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <ReportsTab />
            </motion.div>
          )}

          {sub === 'trends' && (
            <motion.div key="trends" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <TrendsSection />
            </motion.div>
          )}

          {sub === 'audit' && (
            <motion.div key="audit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
              <AuditPage />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ViewContent>
  );
}

/* ── Trend (extracted from the old IntelligenceTab, theme-var restyle) ── */
function TrendsSection() {
  const [trends, setTrends] = useState<ConsumptionTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setTrends(await (await fetch('/api/stock/trends')).json()); } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">
        Son 14 gün · faktiki sərfiyyat (sifarişlərdən)
      </p>
      {trends.length === 0 ? (
        <EmptyState icon={<BarChart2 size={32} className="text-[var(--theme-text-muted)]" />} title="Trend məlumatı yoxdur" description="Sifarişlər sərf etdikcə buradan 30 günlük sərfiyyat görünəcək." />
      ) : (
        trends.map((t, i) => (
          <motion.div key={t.ingredient_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-[var(--theme-text)]">{t.ingredient_name}</p>
              <p className="text-[11px] text-[var(--theme-text-muted)] tabular-nums">
                {t.weekly_avg?.toFixed(1)}/həftə • {t.monthly_avg?.toFixed(1)}/ay
              </p>
            </div>
            <div className="flex items-end gap-1 h-10">
              {(t.daily || []).slice(-14).map((d, j) => {
                const max = Math.max(...(t.daily || []).map(x => x.consumption), 1);
                return (
                  <div key={j} className="flex-1 flex items-end h-full" title={`${d.date?.slice(5) || ''}: ${d.consumption}`}>
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.1 + j * 0.02, type: 'spring', stiffness: 300, damping: 24 }}
                      style={{ transformOrigin: 'bottom', height: `${Math.max(8, (d.consumption / max) * 100)}%` }}
                      className={`w-full rounded-t bg-[var(--theme-text)] ${d.consumption > 0 ? 'opacity-90' : 'opacity-15'}`}
                    />
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}
