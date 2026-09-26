// ============================================================================
// Offline engine tests (Q8 phase 1+2, owner: "internet söndürsəm işləyəcək??")
// Run:  node --experimental-strip-types src/__tests__/offline-queue.test.mjs
// Plain node:assert — stubs DOM (localStorage/window/navigator/document/fetch)
// and verifies: capture policy, dedupe, replay (200/409/500), read-cache
// fallback, and money-route blocking in apiFetch.
// ============================================================================
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// ── tsconfig `@/` alias → project root (plain node has no path aliases) ────
const rootUrl = new URL('../..', import.meta.url); // → saito-admin/
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      return next(new URL(`src/${specifier.slice(2)}.ts`, rootUrl).href, context);
    }
    return next(specifier, context);
  },
});

// ── DOM stubs (must exist BEFORE the lib imports) ──────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: k => void store.delete(k),
  clear: () => void store.clear(),
};
const listeners = new Map();
globalThis.window = {
  addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
  removeEventListener: (t, fn) => { listeners.get(t)?.delete(fn); },
  dispatchEvent: (e) => { listeners.get(e.type)?.forEach(fn => fn(e)); return true; },
  location: { origin: 'http://localhost:3000' },
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { cookie: '', addEventListener: () => {}, removeEventListener: () => {} };

// fetch mock — scriptable per test
let fetchImpl = async () => new Response('{}', { status: 200 });
globalThis.fetch = (...a) => fetchImpl(...a);
// Response/Request/Crypto are Node globals ≥18/19; polyfill randomUUID if needed
if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` };
}

const { enqueue, peekQueue, drainNow, OFFLINE_WRITE_ROUTES, OFFLINE_BLOCKED_ROUTES, routeOf } =
  await import('../lib/offline/queue.ts');
const { cachePut, cacheGet, OFFLINE_READ_ROUTES } =
  await import('../lib/offline/cache.ts');
const { isOffline, setForcedOffline, isForcedOffline } =
  await import('../lib/offline/monitor.ts');
const { apiFetch } =
  await import('../lib/api-fetch.ts');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
async function okAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('\n[1] capture policy + dedupe');
ok('routeOf strips query', () => assert.equal(routeOf('/api/orders?foo=1'), '/api/orders'));
ok('pay + cash-drawer routes classified', () => {
  assert.ok(OFFLINE_WRITE_ROUTES.has('/api/orders/pay'));
  assert.ok(OFFLINE_WRITE_ROUTES.has('/api/orders'));
  assert.ok(OFFLINE_BLOCKED_ROUTES.has('/api/cash-drawer'));
  assert.ok(OFFLINE_BLOCKED_ROUTES.has('/api/orders/refund'));
});
ok('GET never queued', () => assert.equal(enqueue('/api/orders', 'GET', null), null));
ok('non-whitelisted route never queued', () => assert.equal(enqueue('/api/whatever', 'POST', '{}'), null));
const idem = 'pay-key-123';
const q1 = enqueue('/api/orders/pay', 'POST', JSON.stringify({ idempotency_key: idem }), idem);
const q2 = enqueue('/api/orders/pay', 'POST', JSON.stringify({ idempotency_key: idem }), idem);
ok('idempotency dedupe', () => { assert.ok(q1); assert.equal(q2, null); assert.equal(peekQueue().length, 1); });
ok('auto flag: pay=auto, orders=manual', () => {
  const q = peekQueue();
  assert.equal(q.find(i => i.url.includes('/pay')).auto, true);
});
enqueue('/api/orders', 'POST', JSON.stringify({ x: 1 }));
ok('order create captured as manual', () => {
  const o = peekQueue().find(i => i.url === '/api/orders');
  assert.ok(o); assert.equal(o.auto, false);
});

console.log('\n[2] replay semantics (200 / 409 / 500)');
store.delete('saito_offline_queue_v1'); // reset via direct key — queue module cached; use fresh items
const r1 = enqueue('/api/pos/tables', 'POST', JSON.stringify({ status: 'occupied' }), null);
ok('table transition captured (auto)', () => {
  assert.ok(r1);
  assert.equal(peekQueue().find(i => i.url === '/api/pos/tables').auto, true);
});
await okAsync('replay 200 → dropped + sync event', async () => {
  let synced = 0;
  const h = (e) => { synced = e.detail.synced; };
  window.addEventListener('saito:offline-sync', h);
  fetchImpl = async () => new Response('{"success":true}', { status: 200 });
  drainNow();
  await new Promise(r => setTimeout(r, 120));
  window.removeEventListener('saito:offline-sync', h);
  assert.equal(peekQueue().find(i => i.url === '/api/pos/tables'), undefined);
  assert.ok(synced >= 1, `sync event fired (synced=${synced})`);
});
enqueue('/api/orders/pay', 'POST', JSON.stringify({ idempotency_key: 'k-409' }), 'k-409');
await okAsync('409 idempotent_conflict → dropped (already applied)', async () => {
  fetchImpl = async () => new Response('{"error":"idempotent_conflict"}', { status: 409 });
  drainNow();
  await new Promise(r => setTimeout(r, 120));
  assert.equal(peekQueue().find(i => i.idemKey === 'k-409'), undefined);
});
const r500 = enqueue('/api/orders/pay', 'POST', JSON.stringify({ idempotency_key: 'k-500' }), 'k-500');
await okAsync('500 → kept, attempts++, backoff scheduled', async () => {
  fetchImpl = async () => new Response('boom', { status: 500 });
  drainNow();
  await new Promise(r => setTimeout(r, 120));
  const it = peekQueue().find(i => i.idemKey === 'k-500');
  assert.ok(it, 'still queued');
  assert.equal(it.attempts, 1);
});

console.log('\n[3] force-offline + apiFetch policy');
ok('force-offline flips isOffline()', () => {
  setForcedOffline(true);
  assert.equal(isOffline(), true);
  assert.equal(isForcedOffline(), true);
});
await okAsync('apiFetch pay while offline → 202 queued (auto-replay, idempotent)', async () => {
  const res = await apiFetch('/api/orders/pay', { method: 'POST', body: JSON.stringify({ idempotency_key: 't-pay-1' }) });
  assert.equal(res.status, 202);
  const j = await res.json();
  assert.equal(j.queued, true);
  const it = peekQueue().find(i => i.idemKey === 't-pay-1');
  assert.ok(it && it.auto === true, 'captured + auto-replay');
});
await okAsync('apiFetch cash-drawer while offline → 503 OFFLINE (no fake success)', async () => {
  const res = await apiFetch('/api/cash-drawer', { method: 'POST', body: '{}' });
  assert.equal(res.status, 503);
  const j = await res.json();
  assert.equal(j.error, 'OFFLINE');
});
await okAsync('apiFetch whitelisted write while offline → 202 queued', async () => {
  const before = peekQueue().length;
  const res = await apiFetch('/api/waitlist', { method: 'POST', body: JSON.stringify({ name: 'Test' }) });
  assert.equal(res.status, 202);
  const j = await res.json();
  assert.equal(j.queued, true);
  assert.equal(peekQueue().length, before + 1);
});
await okAsync('offline GET with snapshot → 200 from cache (X-Saito-From-Cache)', async () => {
  cachePut('/api/products?limit=500', '{"products":[]}');
  const res = await apiFetch('/api/products?limit=500');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Saito-From-Cache'), '1');
  const j = await res.json();
  assert.deepEqual(j, { products: [] });
});
await okAsync('online GET → real fetch + snapshot refresh', async () => {
  // health ping must succeed on release (mock still 500s from the replay test)
  fetchImpl = async () => new Response('{"ok":true}', { status: 200 });
  setForcedOffline(false);
  await new Promise(r => setTimeout(r, 30)); // let the verifying ping settle
  assert.equal(isOffline(), false);
  fetchImpl = async () => new Response('{"live":1}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  const res = await apiFetch('/api/pos/floors');
  assert.equal(res.status, 200);
  await new Promise(r => setTimeout(r, 60)); // cachePut is async-then
  const snap = cacheGet('/api/pos/floors');
  assert.ok(snap, 'snapshot stored for the next outage');
  assert.equal(JSON.parse(snap.body).live, 1);
});
await okAsync('online money write → normal fetch (no interception)', async () => {
  let hit = false;
  fetchImpl = async () => { hit = true; return new Response('{"success":true}', { status: 200 }); };
  const res = await apiFetch('/api/orders/pay', { method: 'POST', body: '{}' });
  assert.equal(res.status, 200);
  assert.equal(hit, true);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (WITH FAILURES)' : ' — ALL GREEN'}\n`);
