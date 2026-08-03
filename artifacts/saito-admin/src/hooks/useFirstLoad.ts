'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * useFirstLoad
 *
 * Returns true only during the very first load of the component.
 *
 * Logic:
 *   1. Starts as `true` immediately on mount.
 *   2. Once `loading` becomes `false` AND at least `delayMs` has passed since mount,
 *      it flips to `false` permanently.
 *   3. After that, it always returns `false` — even if `loading` flips again later.
 *
 * This gives you:
 *   - Skeleton on initial page load
 *   - Instant UI on all subsequent reactive updates (realtime, cache, polling)
 */
export function useFirstLoad(
  delayMs: number = 600,
  loading: boolean = false
): boolean {
  const [active, setActive] = useState(true);
  const completedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (completedRef.current) return;

    const complete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setActive(false);
    };

    // Clear any existing timer
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!loading) {
      // Data already loaded
      complete();
    } else {
      // Wait for minimum delay, then complete regardless of loading state
      timerRef.current = setTimeout(() => {
        complete();
      }, delayMs);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [delayMs, loading]);

  return active;
}
