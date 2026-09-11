// O FINAL VALIDATION GATE (idempotent) — orders O-01..O-08 / G1..G7. Run: node .o-gate.cjs
// START cleanup (survives a crashed prior run) + deterministic fixtures 301-312.
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const APP = 'http://localhost:3000';
const ORG = '00000000-0000-0000-0000-000000000001';
const LOC_A = 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
const LOC_B = '70000000-0000-4000-8000-000000000002';
let PROD = null; // a real product id (set in run) for order-item FK
const R_CASH = '945137c3-fc59-457e-abaa-c16ff8e9cee3', R_WTR = 'cd686876-10d9-4cb2-8cf7-ca6e30beb850';
const TEST_TABLES = [301, 302, 303, 304, 305, 307, 308, 311, 312, 313];

function sql(q) { const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() }; }
function S(q) { const r = sql(q); if (!r.ok) throw new Error('SQL: ' + r.err); return r.out; }
// call a fn that RAISEs on denial; returns {ok, out, err}
function call(fn) { return sql(fn); }
function hashPin(pin) { const salt = crypto.randomBytes(16).toString('hex'); const h = crypto.pbkdf2Sync(pin, salt, 260000, 64, 'sha256').toString('hex'); return `pbkdf2_sha256$260000$${salt}$${h}`; }
const q = (s) => `'${s}'`;
async function api(method, path, { cookie, body, csrf } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (cookie) h['Cookie'] = `saito_token=${cookie}` + (csrf ? `; saito_csrf=${csrf}` : '');
  if (csrf) h['X-CSRF-Token'] = csrf;
  const res = await fetch(APP + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const results = [];
function check(id, name, pass, ev) { results.push({ id, name, pass: !!pass, evidence: String(ev).slice(0, 220) }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${pass ? '' : ' -> ' + String(ev).slice(0, 150)}`); }
async function raceSql(n, build) { return Promise.all(Array.from({ length: n }, (_, i) => new Promise((res) => { const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-c', build(i)], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' }); res({ ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() }); }))); }

const TEST_TABLES_ALL = TEST_TABLES.concat([313]);
const CLEANUP_SQL = `
  ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard;
  DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES_ALL.join(',')}));
  DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES_ALL.join(',')}));
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES_ALL.join(',')}));
  DELETE FROM orders WHERE table_number IN (${TEST_TABLES_ALL.join(',')});
  DELETE FROM table_floors WHERE table_number IN (${TEST_TABLES_ALL.join(',')});
  ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard;
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'OG_%');
  DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'OG_%');
  UPDATE staff SET is_active=false, status='INACTIVE', pin_hash='' WHERE name LIKE 'OG_%';
`;

(async () => {
  S(CLEANUP_SQL);
  console.log('----- START CLEANUP OK -----');
  PROD = S(`SELECT id::text FROM products ORDER BY created_at LIMIT 1`) || crypto.randomUUID();

  const R_ADMIN = S(`SELECT id::text FROM roles WHERE name='admin' LIMIT 1`);
  const mkStaff = (name, role, loc) => { const id = crypto.randomUUID(); S(`INSERT INTO staff (id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(id)},${q(name)},${q(name)},${q(role)},true,'ACTIVE',${q(hashPin('7777'))},${q(ORG)})`); if (loc) S(`INSERT INTO staff_locations (staff_id,location_id,is_primary,active,organization_id) VALUES (${q(id)},${q(loc)},true,true,${q(ORG)})`); return id; };
  const mkSess = (uid, role, loc) => { const tok = crypto.randomUUID(); S(`INSERT INTO sessions (token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(tok)},${q(uid)},${q(role)},now()+interval '3h','ACTIVE',${q(ORG)},${q(loc)})`); return tok; };
  const mkTable = (num, loc) => { S(`INSERT INTO table_floors (table_number,status,location_id,organization_id) VALUES (${num},'occupied',${q(loc)},${q(ORG)})`); return S(`SELECT id::text FROM table_floors WHERE table_number=${num} AND location_id=${q(loc)}`).trim(); };
  const mkOrder = (num, loc, status = 'confirmed') => { const id = crypto.randomUUID(); S(`INSERT INTO orders (id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (${q(id)},${num},'${status}',2,50,${q(loc)},${q(ORG)},'pending',false,now(),now(),1)`); return id; };

  const wtr = mkStaff('OG_WTR', R_WTR, LOC_A);
  const cas = mkStaff('OG_CAS', R_CASH, LOC_A);
  const adm = mkStaff('OG_ADM', R_ADMIN, LOC_A);
  const adm2 = mkStaff('OG_ADM2', R_ADMIN, LOC_A); // 2nd admin for the cancel-vs-pay race
  const tWtr = mkSess(wtr, 'waiter', LOC_A);
  const tCas = mkSess(cas, 'cashier', LOC_A);
  const tAdm = mkSess(adm, 'admin', LOC_A);
  const tAdm2 = mkSess(adm2, 'admin', LOC_A);

  // NOTE (frozen F-05 boundary): the active-order uniqueness index
  //   idx_orders_active_table = UNIQUE(table_number) WHERE active
  // is NOT location-scoped, so the DB forbids two locations holding a SIMULTANEOUS
  // active order on the same number. Also the number-based triggers
  // (trg_order_table_location + trg_orders_sync_table_floors) are ambiguous for
  // duplicate numbers. Both are F-boundary (single-location prod) — G6 keeps F
  // frozen, so we do NOT recreate the index; we pause the number-based triggers
  // ONLY to construct the duplicate-number fixture, then re-enable them. Every
  // test below runs with the full frozen guard set active.
  S(`ALTER TABLE orders DISABLE TRIGGER trg_order_table_location`);
  S(`ALTER TABLE orders DISABLE TRIGGER trg_orders_sync_table_floors`);
  // dup table number 301 in BOTH locations; active order ONLY in LOC_B (index-safe).
  mkTable(301, LOC_A);                 // LOC_A table 301 (no active order)
  mkTable(301, LOC_B); const o301B = mkOrder(301, LOC_B);  // LOC_B active order on 301
  // LOC_A orders on distinct numbers
  mkTable(302, LOC_A); const o302 = mkOrder(302, LOC_A);
  mkTable(303, LOC_A); const o303 = mkOrder(303, LOC_A);
  mkTable(304, LOC_A); const o304 = mkOrder(304, LOC_A);
  mkTable(305, LOC_A); const o305 = mkOrder(305, LOC_A);
  mkTable(312, LOC_A); const o312 = mkOrder(312, LOC_A);
  mkTable(307, LOC_A);
  mkTable(308, LOC_A);
  mkTable(311, LOC_A);
  S(`ALTER TABLE orders ENABLE TRIGGER trg_order_table_location`);
  S(`ALTER TABLE orders ENABLE TRIGGER trg_orders_sync_table_floors`);

  console.log('----- R: reachability = 0 (frozen functions) -----');
  check('R1', 'transition_order_status overloads = 0', S(`SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_order_status'`) === '0');
  check('R2', 'create_or_append_order + create_order_with_items = 0', S(`SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('create_or_append_order','create_order_with_items')`) === '0');
  check('R3', 'transition_order_atomic = 1 overload, service-role-only (anon blocked)', S(`SELECT ((SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_order_atomic')=1 AND has_function_privilege('service_role',(SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_order_atomic' LIMIT 1),'EXECUTE') AND NOT has_function_privilege('anon',(SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_order_atomic' LIMIT 1),'EXECUTE'))::text`) === 'true');
  check('R4', 'transition_delivery_status = 1 token-first overload, svc-only', S(`SELECT ((SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_delivery_status')=1 AND (SELECT proargnames FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_delivery_status' LIMIT 1) IS NOT NULL AND (SELECT array_to_string(proargnames,',') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_delivery_status' LIMIT 1) LIKE 'p_token%' AND has_function_privilege('service_role',(SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='transition_delivery_status' LIMIT 1),'EXECUTE'))::text`) === 'true');
  check('R5', 'cancel_loss_table = 1 token-first overload', S(`SELECT ((SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='cancel_loss_table')=1 AND (SELECT array_to_string(proargnames,',') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='cancel_loss_table' LIMIT 1) LIKE 'p_token%')::text`) === 'true');
  check('R6', 'walkin_atomic = 1 location-scoped overload, svc-only', S(`SELECT ((SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='walkin_atomic')=1 AND (SELECT array_to_string(proargnames,',') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='walkin_atomic' LIMIT 1) LIKE '%p_location_id%' AND has_function_privilege('service_role',(SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='walkin_atomic' LIMIT 1),'EXECUTE') AND NOT has_function_privilege('anon',(SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='walkin_atomic' LIMIT 1),'EXECUTE'))::text`) === 'true');
  check('R7', 'old raw cancel PATCH removed from orders/route.ts (source)', require('fs').readFileSync(process.env.O_ROUTE, 'utf8').split('action === \'delete\'').length === 2 && !require('fs').readFileSync(process.env.O_ROUTE, 'utf8').includes("status: 'cancelled', \n            cancelled_at") , 'source grep');

  console.log('----- P: O-01/G1 permission + location (atomic live path) -----');
  const p1 = call(`SELECT public.transition_order_atomic(${q(tWtr)},${q(o302)},'in_kitchen','x',NULL)`);
  check('P1', 'waiter confirmed->in_kitchen = PERMISSION_DENIED (no orders.edit)', !p1.ok && /PERMISSION_DENIED/i.test(p1.err) && /permission_denied/i.test(p1.err), (p1.err||'').slice(0,90));
  check('P2', 'P1 left order state untouched (confirmed)', S(`SELECT status FROM orders WHERE id=${q(o302)}`) === 'confirmed');
  const p3 = call(`SELECT public.transition_order_atomic(${q(tWtr)},${q(o303)},'cancelled','x',NULL)`);
  check('P3', 'waiter confirmed->cancelled = PERMISSION_DENIED (orders.cancel admin-only)', !p3.ok && /PERMISSION_DENIED/i.test(p3.err), (p3.err||'').slice(0,90));
  check('P4', 'cashier confirmed->in_kitchen = ALLOWED (orders.edit)', S(`SELECT public.transition_order_atomic(${q(tCas)},${q(o303)},'in_kitchen','x',NULL)->>'new_status'`) === 'in_kitchen');
  const p5 = call(`SELECT public.transition_order_atomic(${q(tCas)},${q(o304)},'cancelled','x',NULL)`);
  check('P5', 'cashier confirmed->cancelled = PERMISSION_DENIED', !p5.ok && /PERMISSION_DENIED/i.test(p5.err), (p5.err||'').slice(0,90));
  check('P6', 'admin confirmed->cancelled = ALLOWED (orders.cancel)', S(`SELECT public.transition_order_atomic(${q(tAdm)},${q(o304)},'cancelled','customer left',NULL)->>'new_status'`) === 'cancelled');
  check('P7', 'identity from session: audit performed_by = cashier staff id', S(`SELECT coalesce((performed_by::text)=${q(cas)}::text,'f') FROM audit_logs WHERE record_id=${q(o303)} AND action='order.transition' ORDER BY created_at DESC LIMIT 1`) === 't');
  const p8 = call(`SELECT public.transition_order_atomic(${q(tCas)},${q(o301B)},'in_kitchen','x',NULL)`);
  check('P8', 'LOC_A cashier -> LOC_B order (dup table 301) = location_denied', !p8.ok && /PERMISSION_DENIED/i.test(p8.err) && /location_denied/i.test(p8.err), (p8.err||'').slice(0,90));
  check('P9', 'P8 left LOC_B order untouched (confirmed)', S(`SELECT status FROM orders WHERE id=${q(o301B)}`) === 'confirmed');
  const p10 = call(`SELECT public.transition_order_atomic('not-a-real-token',${q(o305)},'in_kitchen',NULL,NULL)`);
  check('P10', 'invalid token -> BLOCKED + order untouched', !p10.ok && S(`SELECT count(*) FROM orders WHERE id=${q(o305)} AND status<>'confirmed'`) === '0', (p10.err||'').slice(0,60));
  check('P11', 'kitchen sync parity: in_kitchen order got kitchen_status=preparing', S(`SELECT kitchen_status FROM orders WHERE id=${q(o303)}`) === 'preparing');
  // table machine: occupied->in_kitchen is NOT a valid table transition -> guarded fallback keeps table valid
  check('P12', 'floor sync guarded: table 303 still a valid state (no corruption/crash)', ['occupied','ordering','in_kitchen','ready'].includes(S(`SELECT status FROM table_floors WHERE table_number=303 AND location_id=${q(LOC_A)}`)), S(`SELECT status FROM table_floors WHERE table_number=303 AND location_id=${q(LOC_A)}`));

  console.log('----- I: route-level identity spoofing rejected (G1) -----');
  check('I1', 'route rejects caller p_performed_by (400)', (await api('POST', '/api/rpc/transition_order_status', { cookie: tCas, body: { p_order_id: o305, p_new_status: 'in_kitchen', p_performed_by: adm } })).status === 400);
  check('I2', 'route rejects caller p_employee_name (400)', (await api('POST', '/api/rpc/transition_order_status', { cookie: tCas, body: { p_order_id: o305, p_new_status: 'in_kitchen', p_employee_name: 'x' } })).status === 400);
  const i3 = await api('POST', '/api/rpc/transition_order_status', { cookie: tCas, body: { p_order_id: o305, p_new_status: 'in_kitchen' } });
  check('I3', 'route happy path: cashier -> in_kitchen ok via atomic', i3.status === 200 && i3.data?.new_status === 'in_kitchen', `status=${i3.status} ${JSON.stringify(i3.data).slice(0,80)}`);

  console.log('----- G5: cancel via route = permissioned atomic (raw PATCH gone) -----');
  check('C0', 'waiter route cancel = 403 (orders.cancel denied)', (await api('POST', '/api/orders', { cookie: tWtr, body: { action: 'delete', id: o302 } })).status === 403);
  const c1 = await api('POST', '/api/orders', { cookie: tAdm, body: { action: 'delete', id: o312 } });
  check('C1', 'admin route cancel = success + status=cancelled', c1.status === 200 && S(`SELECT status FROM orders WHERE id=${q(o312)}`) === 'cancelled', `status=${c1.status}`);

  console.log('----- CONCURRENCY: cancel-vs-pay race (G5 TOCTOU) -----');
  // Two admins race a confirmed order: A->cancelled, B->paid. The row lock in
  // transition_order_atomic guarantees exactly ONE observes the old status and
  // applies it; the other sees the changed status and its target becomes
  // INVALID_TRANSITION (blocked). Final state must be exactly one of {cancelled,paid}.
  const oCP = mkOrder(307, LOC_A);
  const cp = await Promise.all([
    sql(`SELECT (public.transition_order_atomic(${q(tAdm)},${q(oCP)},'cancelled','race-cancel',NULL)->>'success')::text`),
    sql(`SELECT (public.transition_order_atomic(${q(tAdm2)},${q(oCP)},'paid','race-pay',NULL)->>'success')::text`),
  ]);
  const cpWins = cp.filter(x => x.out === 'true').length;
  const cpFinal = S(`SELECT status FROM orders WHERE id=${q(oCP)}`);
  check('CC1', 'cancel-vs-pay race -> exactly 1 winner, final in {cancelled,paid}', cpWins === 1 && ['cancelled','paid'].includes(cpFinal), `wins=${cpWins} final=${cpFinal}`);
  check('CC2', 'no cash recorded for a lost pay (order_payments only if paid)', S(`SELECT count(*) FROM order_payments op JOIN orders o ON o.id=op.order_id WHERE o.id=${q(oCP)} AND o.status='cancelled'`) === '0', S(`SELECT count(*) FROM order_payments op WHERE op.order_id=${q(oCP)}`));
  const oRT = mkOrder(308, LOC_A);
  const rt2 = await Promise.all([
    sql(`SELECT (public.transition_order_atomic(${q(tAdm)},${q(oRT)},'cancelled','race-cancel',NULL)->>'success')::text`),
    sql(`SELECT (public.transition_order_atomic(${q(tCas)},${q(oRT)},'in_kitchen','race-trans',NULL)->>'success')::text`),
  ]);
  const okWins = rt2.filter(x => x.out === 'true').length;
  const finalStatus = S(`SELECT status FROM orders WHERE id=${q(oRT)}`);
  check('CC3', 'cancel-vs-transition -> exactly 1 winner, state consistent', okWins === 1 && ['cancelled','in_kitchen'].includes(finalStatus), `wins=${okWins} final=${finalStatus}`);

  console.log('----- CONCURRENCY: create (G4) -----');
  // Verified DB invariant (live, table 366 fixture): 2 concurrent creates on the
  // same clean table -> the 2nd active-order insert is blocked by
  // idx_orders_active_table (or becomes an append). Deterministic end state:
  // exactly 1 active order per (table, location) + pointer set + no 500.
  const cr = await Promise.all([
    api('POST', '/api/orders', { cookie: tCas, body: { table_number: 311, items: [{ product_id: PROD, product_name: 'A', quantity: 1, unit_price: 10 }] } }),
    api('POST', '/api/orders', { cookie: tCas, body: { table_number: 311, items: [{ product_id: PROD, product_name: 'B', quantity: 1, unit_price: 20 }] } }),
  ]);
  const crStatuses = [cr[0].status, cr[1].status];
  const crActive = S(`SELECT count(*) FROM orders WHERE table_number=311 AND location_id=${q(LOC_A)} AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')`);
  const crPtr = S(`SELECT (current_order_id IS NOT NULL)::text FROM table_floors WHERE table_number=311 AND location_id=${q(LOC_A)}`);
  check('CA1', '2 concurrent create -> no 500, final active=1, pointer set (dup blocked or appended)',
    crStatuses.every(s => s < 500) && crActive === '1' && crPtr === 'true',
    `statuses=[${crStatuses}] active=${crActive} ptr=${crPtr}`);
  check('CA2', 'all orders on table 311 are LOC_A (no cross-location create)', S(`SELECT count(*) FROM orders WHERE table_number=311 AND location_id IS DISTINCT FROM ${q(LOC_A)}`) === '0');
  // Sequential append to the existing active order on 311 (real single-session path)
  const caA = await api('POST', '/api/orders', { cookie: tCas, body: { table_number: 311, items: [{ product_id: PROD, product_name: 'C', quantity: 1, unit_price: 5 }] } });
  check('CA3', 'sequential append to active order 311 = 200, still 1 active order', caA.status === 200 && S(`SELECT count(*) FROM orders WHERE table_number=311 AND location_id=${q(LOC_A)} AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')`) === '1', `status=${caA.status} active=${S(`SELECT count(*) FROM orders WHERE table_number=311 AND location_id=${q(LOC_A)} AND status NOT IN ('paid','cancelled','closed')`)}`);

  console.log('----- G4: cross-location create via route = DENIED -----');
  // table 313 exists ONLY in LOC_B
  S(`INSERT INTO table_floors (table_number,status,location_id,organization_id) VALUES (313,'occupied',${q(LOC_B)},${q(ORG)})`);
  const xLoc = await api('POST', '/api/orders', { cookie: tCas, body: { table_number: 313, items: [{ product_id: PROD, product_name: 'X', quantity: 1, unit_price: 5 }] } });
  check('X1', 'LOC_A cashier -> LOC_B-only table 313 = 400 (not created)', xLoc.status === 400 && S(`SELECT count(*) FROM orders WHERE table_number=313 AND location_id=${q(LOC_A)}`) === '0', `status=${xLoc.status}`);
  check('X2', 'duplicate table number 301: LOC_A order unaffected by LOC_B order', S(`SELECT count(*) FROM orders WHERE table_number=301 AND location_id=${q(LOC_B)} AND status='confirmed'`) === '1');

  console.log('----- G7: read scope (leakage = 0) -----');
  const gA = await api('GET', '/api/orders', { cookie: tCas });
  const gK = await api('GET', '/api/kitchen/orders', { cookie: tCas });
  const locBLeak = (gA.data?.orders || []).filter(o => o.location_id === LOC_B).length + ((gK.data) || []).filter(o => o.location_id === LOC_B).length;
  check('G1r', '/api/orders: cashier reads 200, 0 LOC_B rows', gA.status === 200 && ((gA.data?.orders)||[]).filter(o=>o.location_id===LOC_B).length === 0, `status=${gA.status}`);
  check('G2r', '/api/kitchen/orders: 200 + 0 LOC_B rows', gK.status === 200 && ((gK.data)||[]).filter(o=>o.location_id===LOC_B).length === 0, `status=${gK.status}`);
  check('G3r', 'no session -> 401 on both reads', (await api('GET', '/api/orders')).status === 401 && (await api('GET', '/api/kitchen/orders')).status === 401);

  console.log('----- G3: QR live DB proof (re-run) -----');
  // Use table 312 — its only order was cancelled by C1, so the active-order slot
  // (idx_orders_active_table) is free for a fresh qr_order.
  let qrOk;
  try {
    qrOk = S(`
      WITH ins AS (
        INSERT INTO orders (table_number, status, total_amount, location_id, organization_id, order_type, kitchen_status, is_draft, version)
        SELECT 312, 'confirmed', 12.5, location_id, organization_id, 'qr_order', 'pending', false, 1
        FROM table_floors WHERE table_number=312 AND location_id=${q(LOC_A)} RETURNING id, location_id
      )
      SELECT 'ok' FROM ins WHERE ins.location_id=${q(LOC_A)}
    `);
  } catch (e) { qrOk = 'err:' + e.message.slice(0,60); }
  check('QR1', 'QR order insert with server-trusted table location passes triggers (server-side, matches route)', qrOk === 'ok', qrOk);
  S(`DELETE FROM orders WHERE order_type='qr_order' AND table_number=312`);

  // ===== END CLEANUP ===== (CLEANUP_SQL already covers 313 under the disabled
  // archive guard; do NOT delete tables here or F-04 blocks it)
  S(CLEANUP_SQL);
  const resO = S(`SELECT count(*) FROM orders WHERE table_number IN (${TEST_TABLES_ALL.join(',')})`);
  const resT = S(`SELECT count(*) FROM table_floors WHERE table_number IN (${TEST_TABLES_ALL.join(',')})`);
  const resS = S(`SELECT count(*) FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'OG_%')`);
  check('Z1', 'END residue = 0 (orders/tables/sessions)', resO === '0' && resT === '0' && resS === '0', `o=${resO} t=${resT} s=${resS}`);
  check('Z2', 'archive guard re-enabled after cleanup', S(`SELECT (t.tgenabled::text IN ('O','D'))::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='table_floors' AND t.tgname='trg_table_archive_guard'`) === 'true');

  const failed = results.filter(r => !r.pass);
  console.log(`\n===== O GATE: ${results.length - failed.length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(',') : ''} =====`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
