// In-memory stale-while-revalidate micro-cache for admin GET endpoints (v7).
//
// Goal: "native-app" feel — a page must show data on FIRST PAINT, not after
// a spinner. Two mechanisms:
//   1. `cachedFetch` — returns cached data INSTANTLY (fresh or stale);
//      when stale it revalidates in the background (fire-and-forget).
//   2. `primeCache` / `idlePrime` — the shell pre-warms hot endpoints during
//      idle time, so the network round-trip happens BEFORE the user navigates.
//
// Deliberately NOT used for: POS terminal (live order state), mutations,
// or anything where a ≤N-second stale read is unacceptable.

type Entry = { data: unknown; at: number };

const store = new Map<string, Entry>();
const DEFAULT_TTL = 4000; // ms — freshness window for instant return

export function cachedFetch<T>(url: string, ttlMs: number = DEFAULT_TTL, opts?: { revalidate?: boolean }): Promise<T> {
  const hit = store.get(url);
  const run = async () => {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    store.set(url, { data: d, at: Date.now() });
    return d as T;
  };
  // fresh → instant
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.data as T);
  // stale → show it now, refresh in background (SWR)
  if (hit && opts?.revalidate !== false) {
    run().catch(() => { /* keep stale on error */ });
    return Promise.resolve(hit.data as T);
  }
  return run();
}

/** Fire a background fetch so the cache is warm for the next real read. */
export function primeCache(url: string, ttlMs: number = DEFAULT_TTL): void {
  void cachedFetch(url, ttlMs);
}

/** Prime several URLs on the next idle window (no main-thread pressure). */
export function idlePrime(urls: string[], ttlMs: number = DEFAULT_TTL): void {
  if (typeof window === 'undefined') return;
  const run = () => urls.forEach(u => primeCache(u, ttlMs));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 1500 });
  else window.setTimeout(run, 400);
}

/** SYNCHRONOUS fresh-cache peek — lets a detail view open with content on
 *  the very first frame when a row hover/selection pre-warmed the URL
 *  (native-app zero-latency open; returns null when absent/stale). */
export function cachePeek<T>(url: string, ttlMs: number = DEFAULT_TTL): T | null {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  return null;
}

/** Test/dev helper. */
export function clearDataCache(): void {
  store.clear();
}
