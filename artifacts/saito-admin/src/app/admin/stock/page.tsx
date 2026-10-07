'use client';

// 13p — /admin/stock, from zero.
//
// The 13n/13o scroll-spy single-page is GONE. That machinery — sticky pill
// nav, MutationObserver reflow-spy, URL write-back, settle-lock — was the
// source of every r38/r39 jump & oscillation. In its place: the app's
// standard focused-view language (gift-cards / customers / products):
//
//   • PageHeaderCard (contained rounded-[32px] card, serif display title)
//     + the 4 ZONE pills (accent-soft, layoutId morph) as the primary nav
//   • ONE stable, page-owned scrollable body
//   • the active zone renders in place — a zone is plain React state
//   • deep link (?view / ?tab / ?sub / ?ingredient) is READ from the URL and
//     applied to state; we never WRITE the URL back → nothing fights a
//     reflow, nothing oscillates (gift-cards syncs nothing to the URL).
//
// The backend contract, the 4 zone engines, and every API-bound leaf
// (StockZone, ProcurementHub, OperationsHub, AnalyticsHub and their tables,
// forms, FullPanels) are untouched — this file is purely the shell.

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useAdminAuth } from '../hooks/useAdminAuth';
import PageHeaderCard from '../components/ui/PageHeaderCard';
import StockZone from './next/StockZone';
import ProcurementHub from './components/ProcurementHub';
import OperationsHub from './components/OperationsHub';
import AnalyticsHub from './components/AnalyticsHub';

type Zone = 'stock' | 'procurement' | 'operations' | 'analytics';

const ZONES: { id: Zone; label: string; sub: string }[] = [
  { id: 'stock', label: 'Stok', sub: 'Anbar · Təzəlik · AI Advisor' },
  { id: 'procurement', label: 'Tədarük', sub: 'Nə Alım · Faktura · Sifarişlər · Tədarükçülər' },
  { id: 'operations', label: 'Sayım & İtki', sub: 'Sayım · İtki · Qaytarış · Anomaliyalar' },
  { id: 'analytics', label: 'Analiz', sub: 'Hesabat · Trend · Audit' },
];

const DEFAULT_SUBS: Record<Zone, string> = {
  stock: '', procurement: 'buy', operations: 'counts', analytics: 'report',
};

// every ?view= (new + all 13f/13h/13i legacy) → { zone, sub }
const VIEW_TARGET: Record<string, { zone: Zone; sub?: string }> = {
  stock: { zone: 'stock' },
  anbar: { zone: 'stock' },
  procurement: { zone: 'procurement', sub: 'buy' },
  intelligence: { zone: 'procurement', sub: 'buy' },
  buy: { zone: 'procurement', sub: 'buy' },
  invoice: { zone: 'procurement', sub: 'invoice' },
  po: { zone: 'procurement', sub: 'orders' },
  orders: { zone: 'procurement', sub: 'orders' },
  suppliers: { zone: 'procurement', sub: 'suppliers' },
  operations: { zone: 'operations', sub: 'counts' },
  counts: { zone: 'operations', sub: 'counts' },
  waste: { zone: 'operations', sub: 'waste' },
  returns: { zone: 'operations', sub: 'returns' },
  anomalies: { zone: 'operations', sub: 'anomalies' },
  analytics: { zone: 'analytics', sub: 'report' },
  report: { zone: 'analytics', sub: 'report' },
  trends: { zone: 'analytics', sub: 'trends' },
  audit: { zone: 'analytics', sub: 'audit' },
};

function StockPageInner() {
  const { lightMode } = useTheme();
  const { role, authChecked } = useAdminAuth();
  const reduce = useReducedMotion() ?? false;
  // optimistic during the auth handshake: show elevated tabs first (the hub
  // auto-switches away if the resolved role is not elevated — as before).
  const isElevated = !authChecked || role === 'superadmin' || role === 'owner';
  const searchParams = useSearchParams();
  const router = useRouter();

  const [zone, setZone] = useState<Zone>('stock');
  const [subs, setSubs] = useState<Record<Zone, string>>(DEFAULT_SUBS);
  const [ingredient, setIngredient] = useState<string | null>(null);

  // ONE-WAY URL → state. Re-applies on every query change (in-app nav to a
  // same-route ?view=, back/forward, redirect stubs, HeroBanner links). We
  // never write the URL back, so there is nothing to loop or fight.
  useEffect(() => {
    const view = searchParams.get('view') || searchParams.get('tab') || '';
    const ing = searchParams.get('ingredient');
    if (view === 'recipes') { router.replace('/admin/recipes', { scroll: false }); return; }
    const target = view
      ? (VIEW_TARGET[view] ?? { zone: 'stock' as Zone, sub: undefined })
      : { zone: 'stock' as Zone, sub: undefined };
    const explicitSub = searchParams.get('sub');
    setZone(target.zone);
    if (target.zone !== 'stock') {
      const sub = explicitSub || target.sub || DEFAULT_SUBS[target.zone];
      setSubs(prev => prev[target.zone] === sub ? prev : { ...prev, [target.zone]: sub });
    }
    if (ing != null) setIngredient(ing);
  }, [searchParams, router]);

  const setSub = useCallback((z: Zone, s: string) =>
    setSubs(prev => prev[z] === s ? prev : { ...prev, [z]: s }), []);

  // a zone's hero CTA (Stok) navigates to another zone/sub — a tab switch,
  // not a scroll. The 13n scroll-to-section is gone.
  const onNavigate = useCallback((z: Zone, s?: string) => {
    setZone(z);
    if (s) setSub(z, s);
  }, [setSub]);

  const activeMeta = ZONES.find(z => z.id === zone) ?? ZONES[0];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
      className="h-full w-full flex flex-col overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">

      {/* ── header — gift-cards language: contained card, serif title, zone pills ── */}
      <div className="px-4 sm:px-6 pt-4 pb-3 shrink-0">
        <PageHeaderCard title="Stok" subtitle={activeMeta.sub}>
          <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-0.5">
            {ZONES.map(z => {
              const on = zone === z.id;
              return (
                <button
                  key={z.id}
                  onClick={() => setZone(z.id)}
                  aria-pressed={on}
                  className={`relative shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors duration-150 active:scale-[0.95]
                    ${on ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]'}`}>
                  {on && (
                    <motion.span
                      layoutId="stock-zone-pill"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-full bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)]"
                      aria-hidden />
                  )}
                  <span className="relative z-10">{z.label}</span>
                </button>
              );
            })}
          </div>
        </PageHeaderCard>
      </div>

      {/* ── body — ONE stable, page-owned scroll container (no spy / anchors / settle-lock) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-10">
        <motion.div
          key={zone}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}>
          {zone === 'stock' && <StockZone deepIngredient={ingredient} onNavigate={onNavigate} />}
          {zone === 'procurement' && (
            <ProcurementHub sub={subs.procurement} onSubChange={s => setSub('procurement', s)}
              isElevated={isElevated} lightMode={lightMode} deepIngredient={ingredient} />
          )}
          {zone === 'operations' && (
            <OperationsHub sub={subs.operations} onSubChange={s => setSub('operations', s)}
              isElevated={isElevated} lightMode={lightMode} />
          )}
          {zone === 'analytics' && (
            <AnalyticsHub sub={subs.analytics} onSubChange={s => setSub('analytics', s)} lightMode={lightMode} />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockPageInner />
    </Suspense>
  );
}
