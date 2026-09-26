/**
 * Offline write queue — Q8 phase 1 (owner 2026-09-26).
 *
 * Writes that hit a dead network are captured here (localStorage, FIFO) and
 * replayed automatically when the connection returns. Phase 1 is deliberately
 * CONSERVATIVE: only routes whose server-side contracts make blind replay
 * safe are auto-replayed:
 *
 *   /api/orders/pay      → complete_payment_atomic_v2 double-charge guard
 *   /api/cash-drawer     → idempotency_key in body (dedup server-side)
 *   /api/orders/refund   → idempotency_key in body (dedup server-side)
 *   /api/pos/tables      → guarded state transition (re-apply = no-op)
 *
 * Everything else (order create/append, waitlist append, ...) is captured but
 * marked `manual` — it stays in the queue for the future sync panel instead
 * of risking a silent duplicate. Payments offline-cash-ledger = phase 2.
 */

const LS_KEY = 'saito_offline_queue_v1';

export interface QueueItem {
  id: string;
  url: string;
  method: string;
  body: string | null;      // raw JSON body (string)
  idemKey: string | null;   // dedupe key if the caller provided one
  auto: boolean;            // replay automatically on reconnect
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

// Blind-replay-safe:
//  - /api/orders/pay        → idempotency_key REQUIRED server-side; duplicate
//                             replay = 409 idempotent_conflict → dropped,
//                             payment was applied (or is retried with same key).
//  - /api/pos/tables        → guarded state transition (re-apply = no-op)
//  - /api/reservations/pre-order-items → upsert semantics
const AUTO_REPLAY_ROUTES = new Set<string>([
  '/api/orders/pay',
  '/api/pos/tables',
  '/api/reservations/pre-order-items',
]);

// Captured (queued, manual) but NOT auto-replayed: append-type or
// counter-type routes where a blind re-send could duplicate items.
export const OFFLINE_WRITE_ROUTES = new Set<string>([
  ...AUTO_REPLAY_ROUTES,
  '/api/orders',
  '/api/orders/undo',
  '/api/orders/guest-count',
  '/api/waitlist',
  '/api/campaigns/coupon',
]);

// Still blocked offline: cash-drawer sessions must exist server-side, and
// refund/void/redeem mutate ledgers that have no offline counterpart yet.
export const OFFLINE_BLOCKED_ROUTES = new Set<string>([
  '/api/cash-drawer',
  '/api/orders/refund',
  '/api/payments/void',
  '/api/gift-cards/redeem',
]);

import { useSyncExternalStore } from 'react';

const list: QueueItem[] = [];
const countListeners = new Set<() => void>();

function load() {
  if (list.length) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list.push(...parsed);
    }
  } catch { list.length = 0; }
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded — drop oldest manual items first (they are not
    // auto-replayed anyway), keep auto items at all costs.
    try {
      while (list.length > 20) {
        const idx = list.findIndex(i => !i.auto);
        if (idx === -1) break;
        list.splice(idx, 1);
      }
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch { /* give up silently — queue is best-effort */ }
  }
  countListeners.forEach(l => l());
}

function subscribeCount(cb: () => void) {
  load();
  countListeners.add(cb);
  return () => { countListeners.delete(cb); };
}
export const getQueueCount = () => { load(); return list.length; };
export function useQueueCount(): number {
  return useSyncExternalStore(subscribeCount, getQueueCount, () => 0);
}

export function routeOf(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split('?')[0];
  }
}

/**
 * Capture a write. Returns the queue item id, or null when the caller
 * passed `skip` (e.g. GET or non-whitelisted route).
 */
export function enqueue(url: string, method: string, body: string | null, idemKey: string | null = null): string | null {
  if (typeof method === 'string' && method.toUpperCase() === 'GET') return null;
  const route = routeOf(url);
  if (!OFFLINE_WRITE_ROUTES.has(route)) return null;
  load();
  if (idemKey && list.some(i => i.idemKey === idemKey)) return null; // dedupe
  const item: QueueItem = {
    id: crypto.randomUUID(),
    url,
    method: method.toUpperCase(),
    body,
    idemKey,
    auto: AUTO_REPLAY_ROUTES.has(route),
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  list.push(item);
  persist();
  return item.id;
}

export function peekQueue(): QueueItem[] {
  load();
  return [...list];
}

/* ─── Replay pump ───────────────────────────────────────────────────────────
   Single-flight FIFO. On success → drop the item. On 409/400-class "already
   applied" errors for money routes → also drop (guard proved the write
   happened). Other failures → attempts++ with backoff; after 10 failed
   attempts the item becomes `manual` (no more auto noise).               */

let replaying = false;
let started = false;

/** Manual trigger (banner "İNDİ SİNHRONLAŞDIR" button). */
export function drainNow() {
  void drain();
}

export function startReplayPump() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const onNet = (e: Event) => {
    const detail = (e as CustomEvent).detail as { state?: string } | undefined;
    if (detail?.state === 'online' || (typeof navigator !== 'undefined' && navigator.onLine)) {
      void drain();
    }
  };
  window.addEventListener('saito:net', onNet);
  // also drain once on load if a previous session left auto items + we're online
  if (navigator.onLine) setTimeout(() => void drain(), 4000);
}

const BACKOFFS = [10_000, 30_000, 60_000, 120_000];

async function drain() {
  if (replaying) return;
  load();
  if (!navigator.onLine) return;
  replaying = true;
  try {
    let guard = 0;
    while (guard++ < 50) {
      const next = list.find(i => i.auto);
      if (!next) break;
      const res = await replayOne(next);
      if (res === 'retried') {
        // network still down or server error → stop, backoff timer continues
        scheduleRetry();
        break;
      }
      // 'dropped' → continue with the next item
    }
  } finally {
    replaying = false;
  }
}

async function replayOne(item: QueueItem): Promise<'dropped' | 'retried'> {
  const csrf = document.cookie.match(/(?:^|;\s*)saito_csrf=([^;]+)/)?.[1] || null;
  let res: Response;
  try {
    res = await fetch(item.url, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: item.body,
    });
  } catch {
    // network gone mid-replay — leave for next cycle
    return 'retried';
  }

  const idx = list.findIndex(i => i.id === item.id);
  if (idx === -1) return 'dropped';

  if (res.ok) {
    list.splice(idx, 1);
    persist();
    announceSync(1);
    return 'dropped';
  }

  // 401/403 = session issue, 409/400 = conflict/already-applied (guard hit),
  // 422 = validation — all mean "replaying again will not help blindly":
  if ([401, 403, 409, 422].includes(res.status)) {
    item.lastError = `HTTP ${res.status}`;
    list.splice(idx, 1);
    persist();
    announceSync(0, `HTTP ${res.status}`);
    return 'dropped';
  }

  item.attempts += 1;
  item.lastError = `HTTP ${res.status}`;
  if (item.attempts >= 10) {
    item.auto = false; // too flaky — becomes a manual item
  }
  persist();
  return 'retried';
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRetry() {
  if (retryTimer) return;
  const next = list.find(i => i.auto);
  const delay = next ? BACKOFFS[Math.min(next.attempts, BACKOFFS.length - 1)] : 60_000;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drain();
  }, delay);
}

/* Banner/notification bridge — the layout listens to this to toast
   "N əməliyyat sinxronlaşdı" instead of the queue doing UI work itself. */
export function onSyncComplete(cb: (synced: number, lastError: string | null) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent).detail as { synced: number; lastError: string | null };
    cb(d.synced, d.lastError);
  };
  window.addEventListener('saito:offline-sync', h);
  return () => window.removeEventListener('saito:offline-sync', h);
}
function announceSync(synced: number, lastError: string | null = null) {
  window.dispatchEvent(new CustomEvent('saito:offline-sync', { detail: { synced, lastError } }));
}
