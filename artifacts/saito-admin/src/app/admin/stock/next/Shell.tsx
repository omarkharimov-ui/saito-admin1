'use client';

// 13n — THE INVENTORY PAGE, from zero.
//
// Architecture decision (after the 13k/13l "səhifə oynuyur" saga): NO TABS.
// One continuous scroll, 4 zones, a sticky scroll-spy nav. Nav clicks only
// scroll — nothing unmounts, nothing remounts, nothing swaps. The layout-jump
// bug class is impossible by construction.
//
//   STOK          — status, metrics, AI advisor, Anbar
//   TƏDARÜK       — Nə Alım · Faktura · Sifarişlər · Tədarükçülər
//   SAYIM & İTKI  — Sayım · İtki · Qaytarış · Anomaliyalar
//   ANALİZ        — Hesabat · Trend · Audit

import { useEffect, useRef } from 'react';
import { Package, ShoppingCart, Scale, BarChart2 } from '@/components/ui/saito-icons';
import { motion } from 'framer-motion';
import { SPRING } from '@/lib/motion/system';
import StockZone from './StockZone';
import ProcurementHub from '../components/ProcurementHub';
import OperationsHub from '../components/OperationsHub';
import AnalyticsHub from '../components/AnalyticsHub';
import { useScrollSpy, NAV_OFFSET } from './useScrollSpy';

const ZONES = [
  { id: 'sec-stock', view: 'stock', label: 'Stok', icon: Package },
  { id: 'sec-procurement', view: 'procurement', label: 'Tədarük', icon: ShoppingCart },
  { id: 'sec-operations', view: 'operations', label: 'Sayım & İtki', icon: Scale },
  { id: 'sec-analytics', view: 'analytics', label: 'Analiz', icon: BarChart2 },
] as const;

interface ShellProps {
  isElevated: boolean;
  lightMode: boolean;
  deepIngredient: string | null;
  /** where to land on first load (deep link / legacy ?view=) */
  initialSection: string;
  /** URL sync (?view=) — scroll-spy driven */
  onZoneChange: (view: string) => void;
}

export default function Shell({ isElevated, lightMode, deepIngredient, initialSection, onZoneChange }: ShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { active, scrollTo, scrollRoot } = useScrollSpy(
    ZONES.map(z => z.id),
    rootRef,
  );

  // deep link: land on the requested section and STAY there.
  // 13n-3 (r38c T4): the fixed [120..3600]ms re-anchor window lost to the
  // zones' async content — skeletons collapse into shorter tables AFTER the
  // last anchor, drifting the target (po → −2194px overshoot; counts → +255).
  // Settle-lock: every 300ms, if the target is >8px off, nudge instant, up to
  // 8s. User takeover = explicit INPUT events only (wheel/touch/keys) — the
  // previous "unexplained scroll event" heuristic died too early, because
  // unrelated programmatic scrolls (route-level scroll resets) look identical.
  useEffect(() => {
    if (!initialSection || initialSection === 'sec-stock') return;
    let stopped = false;
    let iv: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(iv);
      clearTimeout(timeout);
      window.removeEventListener('wheel', onUser);
      window.removeEventListener('touchmove', onUser);
      window.removeEventListener('keydown', onUser);
    };
    const onUser = () => stop();
    iv = setInterval(() => {
      if (stopped) return;
      const root = scrollRoot.current;
      const el = document.getElementById(initialSection);
      if (!root || !el) return; // gated section may mount late; keep watching
      const delta = (el.getBoundingClientRect().top - root.getBoundingClientRect().top) - (NAV_OFFSET - 8);
      if (Math.abs(delta) <= 8) return; // on target — keep watching for settle
      root.scrollTop = Math.max(0, root.scrollTop + delta);
    }, 300);
    timeout = setTimeout(stop, 8000);
    window.addEventListener('wheel', onUser, { passive: true });
    window.addEventListener('touchmove', onUser, { passive: true });
    window.addEventListener('keydown', onUser);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  // scroll-spy → URL (shareable/deep-linkable), no scroll side effects.
  useEffect(() => {
    const z = ZONES.find(x => x.id === active);
    if (z) onZoneChange(z.view);
  }, [active, onZoneChange]);

  const activeZone = ZONES.find(z => z.id === active) ?? ZONES[0];

  return (
    <div ref={rootRef} className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-16">
      {/* page head — the title follows the scroll (the page IS the content) */}
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--theme-text-muted)]">Stok · Inventory</p>
          <h1 className="text-3xl sm:text-4xl font-black text-[var(--theme-text)] tracking-tight mt-1.5">{activeZone.label}</h1>
        </div>
      </div>

      {/* sticky scroll-spy nav — click = smooth scroll ONLY (no swap, no jump).
          13n-1: the active zone label lives HERE (the big H1 scrolls away). */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-[var(--theme-bg)]/85 backdrop-blur-md">
        <div className="flex items-center gap-3 max-w-full">
          <span key={activeZone.id} className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)] shrink-0 hidden sm:inline">
            {activeZone.label}
          </span>
        <div className="flex flex-wrap gap-1 rounded-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] p-1 w-fit max-w-full overflow-x-auto">
          {ZONES.map(z => (
            <button
              key={z.id}
              onClick={() => scrollTo(z.id)}
              aria-current={active === z.id ? 'page' : undefined}
              className={`relative flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-xs font-black tracking-wide whitespace-nowrap transition-all active:scale-[0.97] ${active === z.id ? 'text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-text)]/[0.05]'}`}
            >
              {active === z.id && (
                <motion.span layoutId="stock-zone-pill" className="absolute inset-0 rounded-full bg-[var(--theme-text)]" transition={SPRING} />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <z.icon size={15} />
                {z.label}
              </span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* the 4 zones — one page, no remounts */}
      <div className="mt-6 space-y-14">
        <section id="sec-stock" className="scroll-mt-20">
          <StockZone deepIngredient={deepIngredient} gotoSection={id => scrollTo(id)} />
        </section>

        <section id="sec-procurement" className="scroll-mt-20">
          <ProcurementHub sub="buy" onSubChange={id => scrollTo(`sec-${id}`)} isElevated={isElevated} lightMode={lightMode} deepIngredient={deepIngredient} />
        </section>

        <section id="sec-operations" className="scroll-mt-20">
          <OperationsHub sub="counts" onSubChange={id => scrollTo(`sec-${id}`)} isElevated={isElevated} lightMode={lightMode} />
        </section>

        <section id="sec-analytics" className="scroll-mt-20">
          <AnalyticsHub sub="report" onSubChange={id => scrollTo(`sec-${id}`)} lightMode={lightMode} />
        </section>
      </div>
    </div>
  );
}
