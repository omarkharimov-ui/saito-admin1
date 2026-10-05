'use client';

// 13n — /admin/stock, from zero.
//
// ONE PAGE · FOUR ZONES · STICKY SCROLL-SPY NAV.
// The 13i "4 tabs" → 13l "tabs that don't jump" → 13n "no tabs at all"
// progression ends here: the owner's standing complaint ("taba keçirsən
// səhifə oynuyur") is solved architecturally — navigation only scrolls.
//
// URL contract (all old links keep working):
//   /admin/stock                          → top (Stok zone)
//   /admin/stock?view=procurement|operations|analytics|stock  → zone
//   /admin/stock?view=po|counts|waste|returns|suppliers|report|trends|audit|
//                invoice|buy|intelligence|anbar|anomalies      → section
//   /admin/stock?view=recipes             → /admin/recipes (redirect, 13g)
//   /admin/stock?ingredient=<id>          → Stok zone + inspector push
//   scroll-spy writes ?view=<zone> back (shareable position)

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { PageTransition } from '@/components/PageTransition';
import Shell from './next/Shell';

// every ?view= value (new + 13f/13h legacy ten) → the section it lands on.
const VIEW_TO_SECTION: Record<string, string> = {
  stock: 'sec-stock',
  anbar: 'sec-stock',
  procurement: 'sec-procurement',
  intelligence: 'sec-buy',
  buy: 'sec-buy',
  invoice: 'sec-invoice',
  po: 'sec-orders',
  orders: 'sec-orders',
  suppliers: 'sec-suppliers',
  operations: 'sec-operations',
  counts: 'sec-counts',
  waste: 'sec-waste',
  returns: 'sec-returns',
  anomalies: 'sec-anomalies',
  analytics: 'sec-analytics',
  report: 'sec-report',
  trends: 'sec-trends',
  audit: 'sec-audit',
};

// elevated-only sections (superadmin/owner); API enforces server-side too.
const ELEVATED_SECTIONS = new Set(['sec-orders', 'sec-counts', 'sec-returns', 'sec-waste']);
const ELEVATED_FALLBACK: Record<string, string> = {
  'sec-orders': 'sec-procurement',
  'sec-counts': 'sec-anomalies',
  'sec-returns': 'sec-anomalies',
  'sec-waste': 'sec-anomalies',
};

function StockPageInner() {
  const { lightMode } = useTheme();
  const { role, authChecked } = useAdminAuth();
  const isElevated = role === 'superadmin' || role === 'owner';
  const searchParams = useSearchParams();
  const router = useRouter();

  const view = searchParams.get('view') ?? 'stock';
  const deepIngredient = searchParams.get('ingredient');

  // recipes deep link → its own sidebar page (13g owner decision).
  useEffect(() => {
    if (view === 'recipes') router.replace('/admin/recipes', { scroll: false });
  }, [view, router]);

  // landing section (URL-driven); auth resolves → drop a gated section the
  // user may not see (URL-driven deep link from an old bookmark).
  const [landSection, setLandSection] = useState(() => VIEW_TO_SECTION[view] ?? 'sec-stock');
  useEffect(() => {
    if (!authChecked) return;
    if (!isElevated && ELEVATED_SECTIONS.has(landSection)) {
      setLandSection(ELEVATED_FALLBACK[landSection] ?? 'sec-stock');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, isElevated]);

  // scroll-spy → ?view=<zone> (no scroll side effects; shareable position).
  const onZoneChange = useCallback((zoneView: string) => {
    const cur = new URLSearchParams(window.location.search).get('view');
    if (cur === zoneView) return;
    const p = new URLSearchParams(window.location.search);
    p.set('view', zoneView);
    p.delete('sub'); // 13i/13l sub concept is gone — sections are anchors
    router.replace(`/admin/stock?${p.toString()}`, { scroll: false });
  }, [router]);

  return (
    <PageTransition className="min-h-screen bg-[var(--theme-bg)]">
      <Shell
        isElevated={!authChecked || isElevated}
        lightMode={lightMode}
        deepIngredient={deepIngredient}
        initialSection={landSection}
        onZoneChange={onZoneChange}
      />
    </PageTransition>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockPageInner />
    </Suspense>
  );
}
