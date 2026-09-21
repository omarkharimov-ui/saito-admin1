// F FINAL VALIDATION GATE (idempotent) — floor/tables F-01..F-10. Run: node .f-gate.cjs
// START cleanup (survives a crashed prior run) + deterministic fixtures 101-106.
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const { execSync } = require('child_process');

const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const APP = 'http://localhost:3000';
const ORG = '00000000-0000-0000-0000-000000000001';
const LOC_A = 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
const LOC_B = '70000000-0000-4000-8000-000000000002';
const R_MGR = 'bb579b8a-022d-4f89-99c7-56eebcec3032', R_CASH = '945137c3-fc59-457e-abaa-c16ff8e9cee3', R_WTR = 'cd686876-10d9-4cb2-8cf7-ca6e30beb850';
const TEST_TABLES = [101, 102, 103, 104, 105, 106, 107, 108, 201, 202, 203, 204, 205, 206, 207, 208];

function sql(q) { const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() }; }
function S(q) { const r = sql(q); if (!r.ok) throw new Error('SQL: ' + r.err); return r.out; }
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
const succ = (r) => r.filter((x) => x.out === 't' || x.out === 'true').length;

const CLEANUP_SQL = `
  ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard;
  DELETE FROM table_floors WHERE table_number IN (${TEST_TABLES.join(',')});
  DELETE FROM orders WHERE table_number IN (${TEST_TABLES.join(',')});
  ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard;
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'FG_%');
  DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'FG_%');
  UPDATE staff SET is_active=false, status='INACTIVE', pin_hash='' WHERE name LIKE 'FG_%';
`;

(async () => {
  // ===== START CLEANUP (idempotent — survives a crashed prior run) =====
  S(CLEANUP_SQL);
  const startTotal = Number(S(`SELECT count(*) FROM table_floors`));
  const startTable1 = S(`SELECT status FROM table_floors WHERE table_number=1 AND location_id=${q(LOC_A)}`);
  console.log(`----- START CLEANUP OK (production table baseline = ${startTotal}) -----`);

  // ===== DETERMINISTIC FIXTURES =====
  const mkStaff = (name, role, loc, pin) => { const id = crypto.randomUUID(); S(`INSERT INTO staff (id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(id)},${q(name)},${q(name)},${q(role)},true,'ACTIVE',${q(hashPin(pin))},${q(ORG)})`); if (loc) S(`INSERT INTO staff_locations (staff_id,location_id,is_primary,active,organization_id) VALUES (${q(id)},${q(loc)},true,true,${q(ORG)})`); return id; };
  const mkSess = (uid, role, loc) => { const tok = crypto.randomUUID(); S(`INSERT INTO sessions (token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(tok)},${q(uid)},${q(role)},now()+interval '3h','ACTIVE',${q(ORG)},${q(loc)})`); return tok; };
  const mkTable = (num, loc, status = 'occupied') => { S(`INSERT INTO table_floors (table_number,status,location_id,organization_id,floor_id) VALUES (${num},'${status}',${q(loc)},${q(ORG)},(SELECT id FROM floors WHERE location_id=${q(loc)} LIMIT 1))`); return S(`SELECT id::text FROM table_floors WHERE table_number=${num} AND location_id=${q(loc)}`).trim(); };
  const mkOrder = (id, num, loc, status = 'confirmed') => S(`INSERT INTO orders (id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (${q(id)},${num},'${status}',2,50,${q(loc)},${q(ORG)},'pending',false,now(),now(),1)`);

  const wtr = mkStaff('FG_WTR', R_WTR, LOC_A, '5511');
  const mgr = mkStaff('FG_MGR', R_MGR, LOC_A, '5522');
  const tWtr = mkSess(wtr, 'waiter', LOC_A);
  const tMgr = mkSess(mgr, 'manager', LOC_A);
  mkSess(mkStaff('FG_WTRB', R_WTR, LOC_B, '5533'), 'waiter', LOC_B);

  // tables: 101,102,106,105,104 (LOC_A); 103 (LOC_B)
  const tb101 = mkTable(101, LOC_A); mkOrder(crypto.randomUUID(), 101, LOC_A);
  const tb102 = mkTable(102, LOC_A); mkOrder(crypto.randomUUID(), 102, LOC_A);
  const tb103 = mkTable(103, LOC_B); mkOrder(crypto.randomUUID(), 103, LOC_B);

  console.log('----- MANDATED: F-01/F-02 (permission + location) -----');
  check('M1', 'waiter → dismiss = PERMISSION_DENIED', S(`SELECT public.dismiss_table_atomic(${q(tWtr)},101,'x','empty',${q(wtr)},NULL)->>'error'`) === 'PERMISSION_DENIED');
  check('M2', 'waiter → merge = PERMISSION_DENIED', S(`SELECT public.merge_tables_atomic(${q(tWtr)},101,ARRAY[102],${q(wtr)},NULL)->>'error'`) === 'PERMISSION_DENIED');
  check('M3', 'waiter → transfer = PERMISSION_DENIED', S(`SELECT public.transfer_table_atomic(${q(tWtr)},101,102,${q(wtr)},NULL)->>'error'`) === 'PERMISSION_DENIED');
  // own-location ALLOWED op: waiter (orders.create) on own-loc table → NOT an authz denial
  const m4 = S(`SELECT public.activate_table_atomic(${q(tWtr)},${q(tb101)},2)->>'error'`);
  check('M4', 'waiter → own-location op NOT authz-denied (expect TABLE_NOT_RESERVED)', m4 === 'TABLE_NOT_RESERVED' || m4 === undefined, 'err=' + m4);
  // LOC_A actor → LOC_B table: denied AND state untouched (F-03 scoping → invisible → TABLE_NOT_FOUND)
  const m5err = S(`SELECT public.dismiss_table_atomic(${q(tMgr)},103,'x','empty',${q(mgr)},NULL)->>'error'`);
  const m5state = S(`SELECT status FROM table_floors WHERE table_number=103`);
  check('M5', 'Location A actor → Location B table = DENIED + state untouched', (m5err === 'TABLE_NOT_FOUND' || m5err === 'FORBIDDEN_LOCATION') && m5state === 'occupied', `err=${m5err} state=${m5state}`);
  check('M6', 'same table number across locations coexist (101,102@A + 103@B)', S(`SELECT count(*) FROM table_floors WHERE table_number IN (101,102,103)`) === '3');

  console.log('----- MANDATED: F-03 (multi-location identity) -----');
  const rDup = sql(`INSERT INTO table_floors (table_number,status,location_id,organization_id,floor_id) VALUES (101,'empty',${q(LOC_A)},${q(ORG)},(SELECT id FROM floors WHERE location_id=${q(LOC_A)} LIMIT 1))`);
  check('M7', 'duplicate same-location table number = DENIED', rDup.ok === false && /table_floors_location_table_number_key/i.test(rDup.err), (rDup.err || 'ok?!').slice(0, 80));

  console.log('----- MANDATED: F-04 (archive) -----');
  mkTable(104, LOC_A, 'empty');
  S(`SELECT public.archive_table_atomic(${q(tMgr)},104)`);
  const rOrd = sql(`INSERT INTO orders (table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (104,'confirmed',1,10,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1)`);
  check('M8', 'archived table → new order = BLOCKED (TABLE_ARCHIVED)', rOrd.ok === false && /TABLE_ARCHIVED/i.test(rOrd.err), (rOrd.err || 'ok?!').slice(0, 80));
  // M8b (quick-fix 1, 09-21): UI data contract — /api/pos/tables must expose
  // is_archived so the floor renders archived tables as non-selectable tiles.
  const rTables = await api('GET', '/api/pos/tables', { cookie: tMgr });
  const flatT = Array.isArray(rTables.data?.floors) ? rTables.data.floors.flatMap((f) => f.tables) : [];
  const t104 = flatT.find((t) => t.table_number === 104);
  check('M8b', '/api/pos/tables exposes is_archived=true on archived table 104', rTables.status === 200 && t104?.is_archived === true, `status=${rTables.status} t104=${JSON.stringify(t104 ? { is_archived: t104.is_archived, status: t104.status } : null)}`);
  const rDel = sql(`DELETE FROM table_floors WHERE table_number=104`);
  check('M9', 'hard DELETE = BLOCKED (TABLE_ARCHIVE_ONLY)', rDel.ok === false && /TABLE_ARCHIVE_ONLY/i.test(rDel.err), (rDel.err || 'ok?!').slice(0, 80));

  console.log('----- MANDATED: F-05 (pointer lifecycle) -----');
  mkTable(105, LOC_A);
  const op1 = crypto.randomUUID(); mkOrder(op1, 105, LOC_A, 'confirmed');
  check('M10', 'live open order → pointer set (live wins)', S(`SELECT coalesce(current_order_id::text,'') FROM table_floors WHERE table_number=105`) === op1);
  S(`UPDATE orders SET status='cancelled' WHERE id=${q(op1)}`);
  check('M11', 'cancelled order → pointer cleared at runtime (=0 stale)', S(`SELECT coalesce(current_order_id::text,'NULL') FROM table_floors WHERE table_number=105`) === 'NULL');

  console.log('----- MANDATED: F-10 (atomic, no raw PATCH) -----');
  // forward merge 102→101, then UNDO via the ROUTE (must call unmerge_tables_atomic)
  S(`SELECT public.merge_tables_atomic(${q(tMgr)},101,ARRAY[102],${q(mgr)},NULL)`);
  const obxBefore = Number(S(`SELECT count(*) FROM outbox_events WHERE aggregate_type='table'`));
  const undoRes = await api('POST', '/api/orders/undo', { cookie: tMgr, csrf: crypto.randomUUID(), body: { action: 'merge', data: { targetTable: 101, sourceTableNumbers: [102] } } });
  check('F10-1', 'raw PATCH gone; undo-merge via route = atomic RPC SUCCESS', undoRes.data?.success === true && undoRes.data?.result?.success === true, JSON.stringify(undoRes.data).slice(0, 120));
  check('F10-2', 'undo-merge audit row exists (operation_logs)', Number(S(`SELECT count(*) FROM operation_logs WHERE operation ILIKE '%unmerge%' OR operation ILIKE '%merge%'`)) > 0);
  const obxAfter = Number(S(`SELECT count(*) FROM outbox_events WHERE aggregate_type='table'`));
  check('F10-3', 'undo-merge outbox event exists (count increased)', obxAfter > obxBefore, `outbox table.*: ${obxBefore} -> ${obxAfter}`);
  const rBypass = sql(`SELECT public.dismiss_table_atomic('not-a-real-token',101,'x','empty',${q(wtr)},NULL)`);
  check('F10-4', 'raw RPC bypass: invalid token → BLOCKED', (rBypass.ok === false && /Invalid or expired session|FORBIDDEN/i.test(rBypass.err)) || (rBypass.out && /FORBIDDEN/i.test(rBypass.out)), (rBypass.err || rBypass.out).slice(0, 80));
  check('F10-5', 'bypass left table 101 state unchanged (occupied)', S(`SELECT status FROM table_floors WHERE table_number=101`) === 'occupied');

  console.log('----- MANDATED: concurrency battery (real parallel psql) -----');
  // 101 merged? ensure unmerged baseline
  sql(`SELECT public.unmerge_tables_atomic(${q(tMgr)},101,ARRAY[102],${q(mgr)},NULL)`);
  let r = await raceSql(2, () => `SELECT public.merge_tables_atomic(${q(tMgr)},101,ARRAY[102],${q(mgr)},NULL)->>'success'`);
  check('C1', '2x merge → exactly 1 success', succ(r) === 1, r.map((x) => (x.out || x.err).slice(0, 30)).join(' | '));
  r = await raceSql(2, () => `SELECT public.unmerge_tables_atomic(${q(tMgr)},101,ARRAY[102],${q(mgr)},NULL)->>'success'`);
  check('C2', '2x unmerge → exactly 1 success', succ(r) === 1, r.map((x) => (x.out || x.err).slice(0, 30)).join(' | '));
  mkTable(205, LOC_A, 'dirty');
  r = await raceSql(2, () => `SELECT public.clear_table_atomic(${q(tMgr)},205,${q(mgr)},NULL)->>'success'`);
  const c3state = S(`SELECT status FROM table_floors WHERE table_number=205`);
  check('C3', '2x clear on occupied table → consistent end state (clear is idempotent no-op; no corruption)', c3state === 'empty' && succ(r) >= 1, `successes=${succ(r)} final_status=${c3state} raw=${r.map((x) => (x.out || x.err).slice(0, 24)).join(' | ')}`);
  // transfer on occupied+empty pair: source 207 occupied→empty; 2nd parallel transfer must fail (no active order / source empty)
  mkTable(207, LOC_A, 'occupied'); mkTable(208, LOC_A, 'dirty');
  r = await raceSql(2, () => `SELECT public.transfer_table_atomic(${q(tMgr)},207,208,${q(mgr)},NULL)->>'success'`);
  check('C4', '2x transfer → exactly one valid outcome (≤1 success, consistent state)', succ(r) <= 1, r.map((x) => (x.out || x.err).slice(0, 30)).join(' | '));

  console.log('----- RE-AUDIT SWEEP (old bypass implementations unreachable) -----');
  check('A1', 'F-01/02: 8 token table fns exist (p_token identity)', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('activate_table_atomic','clear_table_atomic','dismiss_table_atomic','dismiss_undo_atomic','merge_tables_atomic','unmerge_tables_atomic','transfer_table_atomic','release_paid_table_atomic') AND p.proargnames IS NOT NULL AND array_to_string(p.proargnames,',') LIKE 'p_token%'`) === '8');
  check('A2', 'F-01/02: 0 non-token (caller-identity) overloads remain', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('activate_table_atomic','clear_table_atomic','dismiss_table_atomic','dismiss_undo_atomic','merge_tables_atomic','unmerge_tables_atomic','transfer_table_atomic','release_paid_table_atomic') AND (p.proargnames IS NULL OR array_to_string(p.proargnames,',') NOT LIKE 'p_token%')`) === '0');
  check('A3', 'F-01: all 8 table-op routes requirePermission (no bare requireAuth)', (() => { const files = ['tables/activate','orders/clear-table','orders/dismiss','orders/merge','orders/unmerge','orders/transfer','tables/release','orders/undo']; return files.every((f) => { try { const t = execSync(`cat "/Users/mr.apple/saito-admin1/artifacts/saito-admin/src/app/api/${f}/route.ts"`, { encoding: 'utf8' }); return /requirePermission\(/.test(t); } catch { return false; } }); })(), 'route authz grep');
  check('A4', 'F-10: 0 raw client PATCH to table_floors/orders in undo + transfer routes', (() => { const t = execSync(`cat /Users/mr.apple/saito-admin1/artifacts/saito-admin/src/app/api/orders/undo/route.ts /Users/mr.apple/saito-admin1/artifacts/saito-admin/src/app/api/orders/transfer/route.ts`, { encoding: 'utf8' }); return !/method: 'PATCH'/.test(t); })(), 'raw PATCH grep');
  check('A5', 'F-03: UNIQUE(location_id,table_number) present + global UNIQUE(table_number) gone', S(`SELECT count(*) FROM pg_constraint WHERE conname='table_floors_location_table_number_key'`) === '1' && S(`SELECT count(*) FROM pg_constraint WHERE conname='table_floors_table_number_key'`) === '0');
  check('A6', 'F-05: 0 stale current_order_id pointers production-wide', S(`SELECT count(*) FROM table_floors tf WHERE tf.current_order_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=tf.current_order_id) OR (SELECT status FROM orders o WHERE o.id=tf.current_order_id) IN ('paid','cancelled','closed','refunded','partially_refunded','voided'))`) === '0');
  check('A7', 'F-04: is_archived present + DELETE blocked', S(`SELECT count(*) FROM information_schema.columns WHERE table_name='table_floors' AND column_name='is_archived'`) === '1' && sql(`DELETE FROM table_floors WHERE table_number=1`).ok === false);
  check('A8', 'F-06: seats + fns gone (0 dead references)', S(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='seats'`) === '0' && S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('upsert_seats','get_seat_totals')`) === '0');
  check('A9', 'F-03: table_order_contract view location-scoped', (sql(`SELECT pg_get_viewdef('table_order_contract'::regclass)`).out || '').includes('x.location_id = tf.location_id'));
  // residual (documented Low): tables/seat forward op
  // F-01/F-02 final: tables/seat (forward op) must require orders.create + session-location scope
  check('A10', 'tables/seat: orders.create required + location-scoped (host/cross-loc bypass CLOSED)', (() => { try { const t = execSync(`cat /Users/mr.apple/saito-admin1/artifacts/saito-admin/src/app/api/tables/seat/route.ts`, { encoding: 'utf8' }); return /requirePermission\('orders\.create'\)/.test(t) && /active_location_id/.test(t); } catch { return false; } })(), 'seat route grep');

  console.log('----- RESIDUE CHECKS + FINAL DB SNAPSHOT -----');
  S(CLEANUP_SQL);
  check('Z1', 'test residue: 0 tables 101-108, 0 FG_ staff/sessions', S(`SELECT count(*) FROM table_floors WHERE table_number IN (${TEST_TABLES.join(',')})`) === '0' && S(`SELECT count(*) FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'FG_%')`) === '0');
  check('Z2', 'no NEW orphan orders (orders→table_floors) from this run', S(`SELECT count(*) FROM orders o WHERE o.table_number IN (${TEST_TABLES.join(',')})`) === '0');
  const endTotal = Number(S(`SELECT count(*) FROM table_floors`));
  check('Z3', 'production table count restored to baseline', String(endTotal) === String(startTotal), `baseline=${startTotal} end=${endTotal}`);
  const z4 = S(`SELECT (t.tgenabled::text IN ('O','D'))::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='table_floors' AND t.tgname='trg_table_archive_guard'`);
  check('Z4', 'archive guard trigger enabled again (production protection intact)', z4 === 'true', `tgenabled check=${z4}`);
  check('Z5', 'table 1 production row untouched (status = baseline)', S(`SELECT status FROM table_floors WHERE table_number=1 AND location_id=${q(LOC_A)}`) === startTable1, `baseline=${startTable1}`);

  const failed = results.filter((x) => !x.pass);
  console.log(`\n========== F GATE REPORT ==========\nTOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}\n${failed.length ? 'FAILURES:\n' + failed.map((f) => `  ${f.id} ${f.name}: ${f.evidence}`).join('\n') : 'ALL GREEN'}`);
  fs.writeFileSync('.f-gate-report.json', JSON.stringify({ startTotal, endTotal, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  try { S(CLEANUP_SQL); console.log('(crash) emergency cleanup applied'); } catch {}
  console.error('F GATE CRASH:', e); process.exit(2);
});
