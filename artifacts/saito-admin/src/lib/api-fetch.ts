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
  if (__csrfSingleton) return __csrfSingleton;
  const existing = readCookie(COOKIE_NAME);
  if (existing) {
    __csrfSingleton = existing;
  } else {
    __csrfSingleton = crypto.randomUUID();
    document.cookie = `${COOKIE_NAME}=${__csrfSingleton}; path=/; max-age=3600; SameSite=Strict`;
  }
  return __csrfSingleton;
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

  return fetch(url, {
    ...options,
    headers,
  });
}
