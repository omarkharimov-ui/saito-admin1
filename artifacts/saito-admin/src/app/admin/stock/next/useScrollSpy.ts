'use client';

// 13n — scroll-spy for the single-page inventory.
// The page is ONE continuous scroll (no tab swap — the 13k/13l "səhifə oynuyur"
// class of bugs is impossible by construction: nav clicks only scroll, they
// never unmount/remount anything). This hook:
//   • finds the real scroll root (the desktop shell's overflow-y-auto container),
//   • reports which section is currently "at the top" (rAF-throttled scroll),
//   • provides a smooth scroll-to-section that compensates for the sticky nav.

import { useCallback, useEffect, useRef, useState } from 'react';

export const NAV_OFFSET = 76; // sticky nav height + breathing room

export function useScrollSpy(sectionIds: string[], rootRef: React.RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(sectionIds[0] ?? '');
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);
  const idsKey = sectionIds.join('|');

  // Locate the scrollable ancestor once (same discovery as 13l).
  useEffect(() => {
    let n = rootRef.current?.parentElement ?? null;
    while (n && n !== document.body) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') { scrollRootRef.current = n; break; }
      n = n.parentElement;
    }
  }, [rootRef]);

  useEffect(() => {
    const ids = idsKey.split('|').filter(Boolean);
    const compute = () => {
      const root = scrollRootRef.current;
      if (!root) return;
      const rootTop = root.getBoundingClientRect().top;
      let current = ids[0] ?? '';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        // 13n-1 fix: VIEWPORT-RELATIVE position (elTop - rootTop). The previous
        // version added root.scrollTop back, i.e. compared the section's
        // ABSOLUTE offset (~2000/6000/10000px) against the 84px nav offset —
        // so "current" was stuck at the first section forever.
        if (el.getBoundingClientRect().top - rootTop <= NAV_OFFSET + 8) current = id;
      }
      setActive(prev => (prev === current ? prev : current));
    };
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    };
    // sections mount async (elevated gating / auth) — recompute when DOM changes
    compute();
    scrollRootRef.current?.addEventListener('scroll', onScroll, { passive: true });
    const mo = new MutationObserver(onScroll);
    if (rootRef.current) mo.observe(rootRef.current, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(rafRef.current);
      scrollRootRef.current?.removeEventListener('scroll', onScroll);
      mo.disconnect();
    };
  }, [idsKey, rootRef]);

  const scrollTo = useCallback((id: string, behavior: ScrollBehavior = 'smooth') => {
    const el = document.getElementById(id);
    const root = scrollRootRef.current;
    if (!el || !root) return;
    const top = root.scrollTop + (el.getBoundingClientRect().top - root.getBoundingClientRect().top) - NAV_OFFSET + 8;
    root.scrollTo({ top: Math.max(0, top), behavior });
  }, []);

  return { active, scrollTo, scrollRoot: scrollRootRef };
}
