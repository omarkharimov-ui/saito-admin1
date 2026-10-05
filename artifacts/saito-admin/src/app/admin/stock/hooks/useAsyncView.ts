'use client';

// 13i — the view state machine (owner: "state machine transitions").
// Every inventory sub-view runs through exactly 3 phases:
//
//   loading ──▶ ready      (first successful fetch)
//   loading ──▶ error      (first failed fetch, no data yet)
//   ready   ──▶ error      (reload failed, never seen data)
//   ready   ──▶ ready      (reload failed BUT stale data exists — keep the
//                           screen readable, the caller surfaces a toast)
//
// Re-fetching with data already on screen does NOT flicker back to the
// skeleton (stale-while-revalidate). Stale requests are discarded by seq.

import { useCallback, useEffect, useRef, useState } from 'react';

export type ViewPhase = 'loading' | 'error' | 'ready';

export interface AsyncView<T> {
  phase: ViewPhase;
  data: T | null;
  error: string;
  /** true once at least one successful load has completed */
  hasData: boolean;
  reload: () => void;
}

export function useAsyncView<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncView<T> {
  const [phase, setPhase] = useState<ViewPhase>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const id = ++seq.current;
    if (!hasDataRef.current) setPhase('loading');
    try {
      const d = await loader();
      if (id !== seq.current) return; // stale
      setData(d);
      hasDataRef.current = true;
      setError('');
      setPhase('ready');
    } catch (e: any) {
      if (id !== seq.current) return;
      setError(e?.message || 'Məlumat yüklənə bilmədi');
      // stale-while-revalidate: keep showing the last good data
      setPhase(hasDataRef.current ? 'ready' : 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void load(); }, [load]);

  // 13n-2: STABLE reload identity. The old inline arrow was a new function on
  // every render → any effect keyed on [reload] (realtime subscriptions) tore
  // down and re-subscribed on every re-render — a source of duplicate channel
  // pairs and a refetch storm (E2E r38b: ~170 req/90s, unstable page height).
  const reloadFn = useCallback(() => { void load(); }, [load]);

  return { phase, data, error, hasData: hasDataRef.current, reload: reloadFn };
}
