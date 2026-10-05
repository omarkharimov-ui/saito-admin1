'use client';

// 13i — "Analiz" tab. Everything about "understanding what happened":
//   Hesabat (COGS/AvT/Tazelik/İtki Pattern) · Trend (30 günlük sərfiyyat) · Audit (tam tarixçə + export)
// The old "Ağıllı Analiz" tab is gone — its pieces were re-homed:
//   Təkliflər → Tədarük/Nə Alım · Kalibrasiya → Reseptlər səhifəsi · İnsaytlar → Stok/Advisor.

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart2 } from '@/components/ui/saito-icons';
import { SectionHead } from '../stock-ui';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import type { ConsumptionTrend } from '@/types/inventory';
import TabHero from './TabHero';
import { ViewContent, scrollToSection } from './ViewFrame';
import ReportsTab from './ReportsTab';
import AuditPage from '../../audit/audit-content';

interface Props {
  sub: string;
  onSubChange: (s: string) => void;
  lightMode: boolean;
}

export default function AnalyticsHub({ sub, onSubChange, lightMode }: Props) {
  const hero = {
    tone: 'info' as const,
    title: 'Hesabat, trend və tam tarixçə',
    sub: 'Stokun maliyyə şəklində nəzərdən keçirilməsi — COGS, AvT, təzəlik və hərəkət tarixçəsi.',
  };

  // 13l: sub = scroll anchor (deep link / CTA), not a tab.
  useEffect(() => {
    if (sub === 'report') return; // default = top
    scrollToSection(sub);
  }, [sub]);

  return (
    <ViewContent id="ana">
      <div className="space-y-10">
        <TabHero tone={hero.tone} title={hero.title} sub={hero.sub} lightMode={lightMode} />

        <section id="sec-report" className="scroll-mt-6 space-y-4">
          <SectionHead overline="Analiz" title="Hesabat (30 gün)" />
          <ReportsTab />
        </section>

        <section id="sec-trends" className="scroll-mt-6 space-y-4">
          <SectionHead overline="Analiz" title="Trend (14 günlük sərfiyyat)" />
          <TrendsSection />
        </section>

        <section id="sec-audit" className="scroll-mt-6 space-y-4">
          <SectionHead overline="Analiz" title="Audit (tam tarixçə)" />
          <AuditPage />
        </section>
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
