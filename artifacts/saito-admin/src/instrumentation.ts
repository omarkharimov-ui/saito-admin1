/**
 * Startup hook (nodejs runtime only).
 *
 * Root cause (proven 2026-09-19, P-7 reflow): the global undici fetch pool
 * reuses keep-alive sockets that the Supabase LB has already closed
 * ("UND_ERR_SOCKET: other side closed" — dev log, ~2MB long-lived sockets).
 * Sequential probes survive (pool heals one socket per miss) but the
 * burst→idle→burst rhythm of POS traffic + test gates chronically re-hits
 * dead sockets, surfacing as 500 "fetch failed" on /api/orders items and
 * false 401 waves on valid session tokens (validateAuth / middleware).
 *
 * Fix = transport resilience ONLY, zero business-semantics change:
 * idempotent GET requests are retried once after a 50ms yield — the pool
 * self-heals on the fresh socket. POST/PUT/DELETE are NEVER retried here
 * (idempotency); they keep their existing per-route idempotency keys.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const orig = globalThis.fetch.bind(globalThis);
  const isSocketRace = (e: unknown): boolean => {
    const anyE = e as { cause?: { code?: string; message?: string }; message?: string };
    const code = anyE?.cause?.code || '';
    const msg = `${anyE?.cause?.message || ''} ${anyE?.message || ''}`;
    return /UND_ERR_SOCKET|other side closed|ECONNRESET|socket hang up|fetch failed/i.test(`${code} ${msg}`);
  };
  const methodOf = (input: any, init?: any): string =>
    String(init?.method || (input && typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();

  // Bounded latency for idempotent GETs: undici's default headersTimeout is 300s —
  // a half-open socket (LB reaped mid-idle) can therefore pin a request for 5
  // minutes, and bursts of such hangs accumulate into a bricked event loop
  // (proven 2026-09-19: P-7 h1 4P+4EC green, h2 on the SAME server 100%
  // connection-refused, server later found dead). GETs (session lookups, items)
  // get a 10s AbortController budget + one retry. POSTs are UNCHANGED here
  // (non-idempotent; they keep per-route idempotency keys).
  const GET_TIMEOUT_MS = 10_000;
  const timedOut = (e: unknown): boolean =>
    e instanceof Error && (e.name === 'AbortError' || /timeout/i.test(e.message));

  (globalThis as { fetch: typeof fetch }).fetch = (async (input: any, init?: any) => {
    if (methodOf(input, init) !== 'GET' || init?.signal) return orig(input, init);
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GET_TIMEOUT_MS);
      try {
        return await orig(input, { ...init, signal: ctrl.signal });
      } catch (e) {
        clearTimeout(timer);
        if (attempt === 0 && (timedOut(e) || isSocketRace(e))) {
          await new Promise(r => setTimeout(r, 50));
          continue;
        }
        throw e;
      }
    }
    throw new Error('unreachable');
  }) as typeof fetch;
}
