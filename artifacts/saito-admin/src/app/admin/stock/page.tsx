'use client';

// 13i — STOK HUB, 0-dan. Owner: "4 edirik, 0 dan yenidən, daha qəşəng,
// micro-interactions, state machine transitions, user 3 saniyədə nə etməlidir".
//
// THE 4 INTENT TABS (13f/13g/13h's 10 chips → 4):
//   1. Stok          — "ne var, ne problem var?"   (default)
//   2. Tədarük       — "alım"                       Nə Alım / Faktura / Sifarişlər / Tədarükçülər
//   3. Sayım & İtki  — "hesablaşım"                 Sayım / İtki / Qaytarış / Anomaliyalar
//   4. Analiz        — "idarəetmə"                  Hesabat / Trend / Audit
//
// URL: /admin/stock?view=stock|procurement|operations|analytics&sub=...
// Legacy deep links (13f/13h's 10 ?view= values) are mapped below — old
// bookmarks, old redirectors and old "Sifariş et" links keep working.

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, ShoppingCart, Scale, BarChart2 } from '@/components/ui/saito-icons';
import { SPRING } from '@/lib/motion/system';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { PageTransition } from '@/components/PageTransition';
import StockTab from './components/StockTab';
import ProcurementHub from './components/ProcurementHub';
import OperationsHub from './components/OperationsHub';
import AnalyticsHub from './components/AnalyticsHub';

type TabId = 'stock' | 'procurement' | 'operations' | 'analytics';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { id: 'stock', label: 'Stok', icon: Package },
  { id: 'procurement', label: 'Tədarük', icon: ShoppingCart },
  { id: 'operations', label: 'Sayım & İtki', icon: Scale },
  { id: 'analytics', label: 'Analiz', icon: BarChart2 },
];

// 13f/13h ten-view ?view= values → the new 4-tab layout.
const LEGACY_VIEW_MAP: Record<string, { view: TabId; sub?: string }> = {
  stock: { view: 'stock' },
  anbar: { view: 'stock' },
  intelligence: { view: 'procurement', sub: 'buy' },
  procurement: { view: 'procurement', sub: 'buy' },
  po: { view: 'procurement', sub: 'orders' },
  suppliers: { view: 'procurement', sub: 'suppliers' },
  counts: { view: 'operations', sub: 'counts' },
  waste: { view: 'operations', sub: 'waste' },
  returns: { view: 'operations', sub: 'returns' },
  report: { view: 'analytics', sub: 'report' },
  audit: { view: 'analytics', sub: 'audit' },
};

const DEFAULT_SUB: Record<TabId, string> = {
  stock: '',
  procurement: 'buy',
  operations: 'counts',
  analytics: 'report',
};

// elevated-only sub-pills (superadmin/owner); API enforces server-side too.
const ELEVATED_SUBS = new Set(['orders', 'counts', 'returns', 'waste']);

function StockHubInner() {
  const { lightMode } = useTheme();
  const { role, authChecked } = useAdminAuth();
  const isElevated = role === 'superadmin' || role === 'owner';
  // During the auth check, gated subs/pills stay VISIBLE (optimistic) so a
  // superadmin's `?view=po` deep link keeps its sub; a non-elevated user's
  // URL-driven gated sub is dropped by the effect below once authChecked.
  const elevatedVisible = !authChecked || isElevated;
  const searchParams = useSearchParams();
  const router = useRouter();

  // 13l: "taba keçirsən səhifə oynuyur" — the desktop shell scrolls in an
  // overflow-y-auto container; switching tabs kept the old scrollTop and the
  // different tab heights made the page JUMP. Find the real scroll root once
  // and reset it to top on every tab switch.
  const pageRootRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let n = pageRootRef.current?.parentElement ?? null;
    while (n && n !== document.body) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') { scrollRootRef.current = n; break; }
      n = n.parentElement;
    }
  }, []);

  // ── initial resolution (legacy mapping + default sub; NO role gate here —
  //    role is null until /api/auth/me resolves, gating here would eat the
  //    URL sub for superadmins before auth even lands) ──────────────────────
  const [tab, setTab] = useState<TabId>(() => {
    const v = searchParams.get('view');
    if (v && (['stock', 'procurement', 'operations', 'analytics'] as string[]).includes(v)) return v as TabId;
    if (v && LEGACY_VIEW_MAP[v]) return LEGACY_VIEW_MAP[v].view;
    return 'stock';
  });
  const [sub, setSub] = useState<string>(() => {
    const v = searchParams.get('view');
    const mapped = v && LEGACY_VIEW_MAP[v] ? LEGACY_VIEW_MAP[v] : null;
    const t = mapped ? mapped.view : (v && (['stock', 'procurement', 'operations', 'analytics'] as string[]).includes(v) ? v as TabId : 'stock');
    return searchParams.get('sub') || mapped?.sub || DEFAULT_SUB[t];
  });
  const deepIngredient = searchParams.get('ingredient');

  // 13l: tab switch = scroll reset (the jump fix). First run skipped:
  // a deep-link mount (e.g. ?view=po) must let the hub's section ANCHOR
  // win — child effects fire before this parent one, so resetting here
  // would kill the anchor scroll.
  const tabSwitchedRef = useRef(false);
  useEffect(() => {
    if (!tabSwitchedRef.current) { tabSwitchedRef.current = true; return; }
    scrollRootRef.current?.scrollTo({ top: 0 });
    window.scrollTo(0, 0);
  }, [tab]);

  // recipes deep link → its own sidebar page (13g owner decision).
  useEffect(() => {
    if (searchParams.get('view') === 'recipes') router.replace('/admin/recipes', { scroll: false });
  }, [searchParams, router]);

  // auth resolves: drop a gated sub the user may not see (URL-driven).
  useEffect(() => {
    if (!authChecked) return;
    if (!isElevated && ELEVATED_SUBS.has(sub)) {
      const next = tab === 'operations' ? 'anomalies' : DEFAULT_SUB[tab];
      setSub(next);
      syncUrl(tab, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, isElevated]);

  const syncUrl = useCallback((t: TabId, s: string) => {
    const p = new URLSearchParams();
    if (t !== 'stock') p.set('view', t);
    if (s && t !== 'stock' && s !== DEFAULT_SUB[t]) p.set('sub', s);
    const qs = p.toString();
    router.replace(qs ? `/admin/stock?${qs}` : '/admin/stock', { scroll: false });
  }, [router]);

  const switchTab = (t: TabId) => {
    setTab(t);
    const s = DEFAULT_SUB[t];
    setSub(s);
    syncUrl(t, s);
  };
  const switchSub = (s: string) => {
    setSub(s);
    syncUrl(tab, s);
  };

  const activeTab = TABS.find(t => t.id === tab)!;

  return (
    <PageTransition className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] pb-24">
      <div ref={pageRootRef} className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">

        {/* ── page head: overline + tab title (the title IS the context) ── */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)]`}>
            <activeTab.icon size={19} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--theme-text-muted)]">Stok</p>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">{activeTab.label}</h1>
          </div>
        </div>

        {/* ── 4 intent tabs (13k: pill — owner: "kvadratdır, pill formasına sal") ── */}
        <div className="mt-5 mb-6 flex flex-wrap gap-1 rounded-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`relative flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-xs font-black tracking-wide transition-colors ${tab === t.id ? 'text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}
            >
              {tab === t.id && (
                <motion.span layoutId="stock-tab-pill" className="absolute inset-0 rounded-full bg-[var(--theme-text)]" transition={SPRING} />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <t.icon size={15} />
                {t.label}
              </span>
            </button>
          ))}
        </div>

        {/* ── tab content (state-machine content: each tab manages loading/error/ready) ── */}
        <div className="min-h-[50vh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              {tab === 'stock' && (
                <StockTab onNavigate={(v, s) => { const ns = s || DEFAULT_SUB[v]; setTab(v); setSub(ns); syncUrl(v, ns); }} />
              )}
              {tab === 'procurement' && <ProcurementHub sub={sub} onSubChange={switchSub} isElevated={elevatedVisible} lightMode={lightMode} deepIngredient={deepIngredient} />}
              {tab === 'operations' && <OperationsHub sub={sub} onSubChange={switchSub} isElevated={elevatedVisible} lightMode={lightMode} />}
              {tab === 'analytics' && <AnalyticsHub sub={sub} onSubChange={switchSub} lightMode={lightMode} />}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </PageTransition>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--theme-bg)] flex items-center justify-center">
        <div className="w-10 h-10 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] animate-pulse" />
      </div>
    }>
      <StockHubInner />
    </Suspense>
  );
}
