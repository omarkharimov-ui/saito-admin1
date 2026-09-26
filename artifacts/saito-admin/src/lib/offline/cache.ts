/**
 * Offline read cache — Q8 phase 1. Snapshot of the POS-critical read routes,
 * refreshed on every successful fetch (see apiFetch). When offline, apiFetch
 * serves these instead of failing, so the floor/menu/settings keep rendering.
 *
 * Staleness is visible: synthetic responses carry `X-Saito-From-Cache: 1` and
 * `X-Saito-Cache-At` headers so any UI can show a "cached" chip if it wants.
 */

const PREFIX = 'saito_cache_';

// Read routes worth caching for offline POS continuity.
export const OFFLINE_READ_ROUTES = new Set<string>([
  '/api/products',
  '/api/pos/floors',
  '/api/settings/general',
  '/api/pos/tables',
  '/api/orders',
  '/api/campaigns/list',
  '/api/staff/active',
]);

interface Snapshot { ts: number; body: string; }

export function cachePut(url: string, body: string, maxBytes = 1_500_000) {
  const route = url.split('?')[0];
  if (!OFFLINE_READ_ROUTES.has(route)) return;
  if (typeof body !== 'string' || body.length === 0 || body.length > maxBytes) return;
  try {
    const snap: Snapshot = { ts: Date.now(), body };
    localStorage.setItem(PREFIX + route, JSON.stringify(snap));
  } catch { /* quota — skip, cache is best-effort */ }
}

export function cacheGet(url: string): Snapshot | null {
  const route = url.split('?')[0];
  if (!OFFLINE_READ_ROUTES.has(route)) return null;
  try {
    const raw = localStorage.getItem(PREFIX + route);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (!snap || typeof snap.body !== 'string') return null;
    return snap;
  } catch {
    return null;
  }
}
