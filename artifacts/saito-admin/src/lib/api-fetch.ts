/**
 * apiFetch — canonical client fetch wrapper for all POS/admin mutations.
 *
 * FIX-1 (2026-09-09): CSRF unification + parallel-race safety.
 *
 * The server's double-submit CSRF check (validateCsrfToken) requires the
 * `X-CSRF-Token` header to EQUAL the `saito_csrf` cookie. Two prior defects
 * caused 403s even for apiFetch calls:
 *   1. The cookie was only ever written client-side, and
 *   2. apiFetch generated a NEW random token on EVERY call when the cookie was
 *      momentarily absent. Parallel mutations (e.g. close-bill over N orders,
 *      guest-count +/- bursts) each wrote a different token to the shared
 *      cookie while sending their OWN header value → header≠cookie → 403.
 *
 * Fix: a per-page-load MODULE-LEVEL singleton token. It is read from the
 * cookie once (or generated + written once) and never regenerated per call.
 * Every apiFetch call in a tab therefore sends the SAME header AND the SAME
 * cookie → the double-submit check always passes for same-tab traffic, even
 * under parallelism.
 *
 * NOTE: cross-tab races (two POS terminals in different tabs of one browser
 * sharing the cookie) are a known residual limitation of a fully client-
 * issued token. The definitive hardening is server-issued tokens at login
 * (out of scope for FIX-1 per the approved "client-side only" rule).
 */

const COOKIE_NAME = 'saito_csrf';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// Module-level: one stable token per page load. Initialized lazily once.
let __csrfSingleton: string | null = null;

function ensureCsrfToken(): string | null {
  if (typeof document === 'undefined') return null; // SSR: server adds nothing
  if (__csrfSingleton) {
    // 2026-09-28 (owner: "Invalid CSRF token" root cause): the cookie's
    // max-age is 3600 — a long-open tab EXPIRES the cookie while the
    // per-page-load singleton token stays in memory. The next mutation then
    // sends a header with NO matching cookie → the server's double-submit
    // check fails with 403 "Invalid CSRF token". Self-heal PROACTIVELY: if
    // the cookie is missing/stale, re-establish the pair (cookie := our
    // token) BEFORE the request. The token is client-issued (no server
    // secret), so re-writing the cookie restores consistency without any
    // server change (per the approved "client-side only" rule).
    const cur = readCookie(COOKIE_NAME);
    if (cur && cur !== __csrfSingleton) {
      // Another tab/login flow rotated the shared cookie — adopt it (the
      // old single-tab assumption broke under multi-tab POS terminals).
      __csrfSingleton = cur;
    } else if (!cur) {
      // Cookie expired (1h) — re-write it with the in-memory token.
      document.cookie = `${COOKIE_NAME}=${__csrfSingleton}; path=/; max-age=3600; SameSite=Strict`;
    }
    return __csrfSingleton;
  }
  const existing = readCookie(COOKIE_NAME);
  if (existing) {
    __csrfSingleton = existing;
  } else {
    __csrfSingleton = crypto.randomUUID();
    document.cookie = `${COOKIE_NAME}=${__csrfSingleton}; path=/; max-age=3600; SameSite=Strict`;
  }
  return __csrfSingleton;
}

// ─── Q8 offline phase 1 (2026-09-26, owner: "offline 10000% bunu basla") ───
// Behavior when the monitor reports OFFLINE (or a fetch dies on the network):
//   GET  + cached read route  → serve the last snapshot (X-Saito-From-Cache: 1)
//   POST + capture route      → queue it, reply 202 {queued:true} (non-money)
//   POST + money route        → BLOCK, reply 503 {error:'OFFLINE'} (no fake
//                               "paid" — phase 2 adds the offline cash ledger)
//   everything else           → normal fetch, caller's existing error path
import { isOffline } from '@/lib/offline/monitor';
import { OFFLINE_WRITE_ROUTES, OFFLINE_BLOCKED_ROUTES, enqueue } from '@/lib/offline/queue';
import { OFFLINE_READ_ROUTES, cacheGet, cachePut } from '@/lib/offline/cache';

function routeOf(url: string): string {
  try { return new URL(url, window.location.origin).pathname; }
  catch { return url.split('?')[0]; }
}

function syntheticJson(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const csrfToken = ensureCsrfToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (csrfToken) {
    // Don't overwrite an explicitly-provided header, but keep them consistent.
    headers['X-CSRF-Token'] = csrfToken;
  }

  const method = (options.method || 'GET').toUpperCase();
  const route = routeOf(url);
  const offline = typeof window !== 'undefined' && isOffline();

  // ── offline: reads from snapshot cache ──
  if (offline && method === 'GET' && OFFLINE_READ_ROUTES.has(route)) {
    const snap = cacheGet(url);
    if (snap) {
      return new Response(snap.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Saito-From-Cache': '1',
          'X-Saito-Cache-At': String(snap.ts),
        },
      });
    }
    // no snapshot yet — fall through to a real fetch (it will fail cleanly
    // and the caller's existing catch shows the standard error)
  }

  // ── offline: money routes are blocked, never faked ──
  if (offline && method !== 'GET' && OFFLINE_BLOCKED_ROUTES.has(route)) {
    return syntheticJson(
      { error: 'OFFLINE', message: 'Offline rejim: ödəniş əməliyyatları onlayn işləyir. İnternet qayıtdıqdan sonra təkrarlayın.' },
      503,
    );
  }

  // ── offline: capture whitelisted writes into the queue ──
  if (offline && method !== 'GET' && OFFLINE_WRITE_ROUTES.has(route)) {
    const body = typeof options.body === 'string' ? options.body : null;
    const idemKey = body ? (safeParseIdem(body)) : null;
    const id = enqueue(url, method, body, idemKey);
    if (id) return syntheticJson({ queued: true, queueId: id }, 202);
  }

  // 2026-09-27 (owner "mexaniki problem": Dismiss / order cards need a SECOND
  // click — the first one silently 403s). Root cause: the per-tab CSRF
  // singleton goes stale when ANOTHER tab (or the login flow) rewrites the
  // shared `saito_csrf` cookie — our `X-CSRF-Token` header no longer EQUALS
  // the cookie the server sends back, so the double-submit check rejects the
  // FIRST mutation. The user's second click often lands after the cookie has
  // settled → it passes. Self-heal: on a 403 for a mutation, re-read the
  // cookie; if it drifted, update the singleton and retry ONCE. The CSRF
  // check runs BEFORE any route handler, so a 403 never executed side
  // effects — the retry is safe.
  let res: Response;
  const doFetch = (h: Record<string, string>) => fetch(url, { ...options, headers: h });
  try {
    res = await doFetch(headers);
    if (res.status === 403 && method !== 'GET') {
      const sent = headers['X-CSRF-Token'];
      const fresh = readCookie(COOKIE_NAME);
      if (fresh && sent && fresh !== sent) {
        // Cookie drifted (another tab / login flow) — adopt + retry once.
        __csrfSingleton = fresh;
        try {
          res = await doFetch({ ...headers, 'X-CSRF-Token': fresh });
        } catch {
          /* retry died on the network — surface the original 403 */
        }
      } else if (!fresh && sent) {
        // 2026-09-28: cookie EXPIRED mid-session (1h max-age) — the header
        // has no pair to match. Re-establish the pair with OUR token and
        // retry once (safe: the CSRF check runs before any side effects,
        // and the token is client-issued).
        document.cookie = `${COOKIE_NAME}=${sent}; path=/; max-age=3600; SameSite=Strict`;
        try {
          res = await doFetch(headers);
        } catch {
          /* retry died on the network — surface the original 403 */
        }
      }
    }
  } catch (err) {
    // Network dead (navigator still "online" — server-side outage): same
    // offline policy, but only for mutation routes we know how to replay.
    if (method !== 'GET' && OFFLINE_BLOCKED_ROUTES.has(route)) {
      return syntheticJson(
        { error: 'OFFLINE', message: 'Offline rejim: ödəniş əməliyyatları onlayn işləyir. İnternet qayıtdıqdan sonra təkrarlayın.' },
        503,
      );
    }
    if (method !== 'GET' && OFFLINE_WRITE_ROUTES.has(route)) {
      const body = typeof options.body === 'string' ? options.body : null;
      const idemKey = body ? (safeParseIdem(body)) : null;
      const id = enqueue(url, method, body, idemKey);
      if (id) return syntheticJson({ queued: true, queueId: id }, 202);
    }
    throw err;
  }

  // ── online: refresh read snapshots for the next outage ──
  if (res.ok && method === 'GET' && OFFLINE_READ_ROUTES.has(route)) {
    res.clone().text().then(t => cachePut(url, t)).catch(() => { /* noop */ });
  }

  return res;
}

function safeParseIdem(body: string): string | null {
  try {
    const j = JSON.parse(body);
    return typeof j?.idempotency_key === 'string' ? j.idempotency_key : null;
  } catch {
    return null;
  }
}
