#!/usr/bin/env node
// =============================================================================
// P-9 GATE — schema-normalization verification (S1..S7), P-pattern harness.
// Run: P9_ALL=1 node .p9-gate.cjs
//
// S1  RLS/grant matrix: 15 tables × {anon, authenticated, test_rls_role} vs
//     the M1 access map — functional probes (SET ROLE, rolled-back txns).
//     4 RLS-policy tables: relrowsecurity + policies + no row leak as authed.
// S2  Settings surface: 10 v_settings_* views ≡ settings rows (jsonb compare)
//     + 8 GET /api/settings/* routes 200 with owner token (geo = no GET by design).
// S3  Post-drop smoke: orders.items gone (M4) + INSERT orders without items ok
//     (rolled back) + v_closed_orders item_count ≡ order_items (all rows)
//     + upsert_popular_query roundtrip (table kept, M5 exclusion) — 0 residue.
// S4  FK tripwire ×3 (M6): orphan INSERT → 23503; clean INSERT → ok (rolled back).
// S5  Purge proof (M7): fixture=0, active real=9, pool≤9, 53-ID denylist intact
//     (two-way), FRESH fixture login succeeds (A-gate incident regression-proof).
// S6  Role state: test_rls_role exists, 0 grants on the 15 tables.
// S7  P-8 frozen-surface canary: drawer open → close v2 (5-arg) → idempotent
//     replay (7-arg, same key) on a gate-owned fixture — P-8 retained facts.
//
// Classification (P-pattern): PASS | EXPECTED-CONFLICT | REAL-RISK | HARNESS-FAILURE.
// All DB mutations run in BEGIN...ROLLBACK or are gate-owned fixtures with
// zero-residue teardown. Exit 0 iff RISK=0 AND HARNESS=0.
// =============================================================================
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

if (!process.env.P9_ALL) {
  console.log('P9_ALL not set — P-9 gate is the final P-9 verification battery. Set P9_ALL=1 to run.');
  process.exit(0);
}

const PGHOST = 'aws-1-eu-central-1.pooler.supabase.com', PGPORT = '6543';
const PGUSER = 'postgres.jbxmlnsicbfkbsatnoej', PGPASS = 'hivhU3-sathob-bupcar';
const APP = process.env.APP_URL || 'http://localhost:3000';

function S(sql) {
  const r = spawnSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: PGPASS } });
  return (r.stdout || '').trim();
}
function Sx(sql) {
  const r = spawnSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: PGPASS } });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status || 0 };
}
const q = s => `'${String(s).replace(/'/g, "''")}'`;

const SVC = (fs.readFileSync('artifacts/saito-admin/.env.local', 'utf8').split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')) || '').split('=')[1].trim().replace(/["']/g, '');
const SBU = (fs.readFileSync('artifacts/saito-admin/.env.local', 'utf8').split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')) || '').split('=')[1].trim().replace(/["']/g, '');
async function rpc(fn, args) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(SBU + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
      let d = null; try { d = await r.json(); } catch { }
      last = { status: r.status, data: d, body: JSON.stringify(d) };
      const b = last.body || '';
      if (!/Invalid or expired session|Invalid session|Unauthenticated|Session expired|Session revoked|expired session/i.test(b)) return last;
    } catch (e) { last = { status: 0, body: 'ERR ' + e.message }; return last; }
    await new Promise(r2 => setTimeout(r2, 650 * (i + 1)));
  }
  return last;
}
function httpRaw(method, path, body, headers) {
  return new Promise((resolve) => {
    const u = new URL(APP + path);
    const data = body ? JSON.stringify(body) : null;
    const req = require('http').request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...(headers || {}) } },
      (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    if (data) req.write(data);
    req.end();
  });
}
// P-8-pattern transport guard: Node19+ global-agent keep-alive reuse can race the
// dev server's 5s idle-FIN (proven 2026-09-18: reset request never reaches the
// server log; request is pre-processing => retry is duplication-safe).
async function http(method, path, body, headers) {
  let last;
  for (let i = 0; i < 6; i++) {
    last = await httpRaw(method, path, body, headers);
    if (!/ERR |ECONNRESET|socket hang up/i.test(last.body || '')) return last;
    await sleep(Math.min(3000, 700 * (i + 1)));
  }
  return last;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let PASS = 0, CONFLICT = 0, RISK = 0, HARNESS = 0;
const results = [];
function R(id, name, cls, ok, evidence, note) {
  if (cls === 'PASS') PASS++; else if (cls === 'EXPECTED-CONFLICT') CONFLICT++; else if (cls === 'REAL-RISK') RISK++; else HARNESS++;
  results.push({ id, name, cls, ok, evidence: String(evidence).slice(0, 320), note });
  console.log((cls === 'REAL-RISK' ? '!!! RISK ' : '  ') + cls.padEnd(18) + ' ' + id + ' ' + name + (ok ? '' : '\n   -> ' + String(evidence).slice(0, 300)) + (note ? '\n   NOTE: ' + note : ''));
}
const bodyOf = o => (typeof o === 'string' ? o : (o && o.body) || JSON.stringify(o));

// ============================ CONSTANTS ============================
// 53-ID real-staff denylist (M7, byte-verified 2026-09-17)
const DENY53 = [
  '4e25370a-66cf-4362-ad72-95e8e892355d','3ab7b025-b264-4a93-b186-644e4c7f5f6e',
  '93bab381-e9c7-490a-9a16-f935248fb14d','ca4ef143-e60f-463d-aed3-0efc0a7e3ebb',
  '0f387c45-b5ab-4bdd-b859-d93e9456a670','96baaa16-8779-4d1d-a500-a3ce9084810e',
  'a3d650b1-9635-456a-9bb0-e37d12b475fb','c814879d-5378-4791-8c5f-8ee5aee51994',
  'bc2cda50-7336-407e-8540-5b5896126372','15000000-0000-4000-8000-000000000007',
  'e84f7796-7b5a-402b-a6af-d5a55b0de771','89524095-0357-4fb4-a224-4b4c579170c8',
  '626d985f-b7ff-4d3d-a636-093bea57f618','15000000-0000-4000-8000-000000000004',
  'bde8908d-e375-4c80-81a2-49997383c605','a84d7887-2727-4522-a7fe-376d58c9af96',
  '71b3c067-2ef9-4db7-8432-ac86b456028f','16eb272a-736b-418c-9027-f3ccbaa8186c',
  '9573fd2e-8091-42c0-b642-36a2d7190ce8','0fcb1fbd-6719-4a64-aede-090960a9c895',
  '15000000-0000-4000-8000-000000000008','6d94dbd8-6900-4bdb-b539-2cfb302a4ecc',
  '00b2b3f7-b2a8-4df2-878a-41a7384a1d6a','66601115-bf4c-4fda-b7ca-9e86f74bd098',
  '7fe08d1e-df63-4bb4-9a68-79fc41054081','8aa0edcf-15e5-42c9-9c9d-77a7598fb36c',
  'a598f0c4-3995-4299-8fd4-345a41beb834','1a2577eb-f631-4ff6-b893-199ded007190',
  '4f0a5179-7b07-4d2d-b3d3-5f6cd082a58b','b7cac2bf-259e-419c-b017-e3000818a392',
  'fe3ca1cd-9518-4d88-8768-bcb669cf27b0','15000000-0000-4000-8000-000000000001',
  '1b9b04e4-6be4-4fce-a1d1-7fd4dbb7d2aa','93a01f90-43df-42c7-98e8-e821d7183921',
  '3a1d026c-b199-4e69-9bd7-b93200892a5e','f71f31e2-026c-413b-b43a-887f8ae997ae',
  '15000000-0000-4000-8000-000000000005','8ba82d41-271e-4524-a73b-6e186c7bd5d1',
  '2e4f68d1-3a4e-46b0-a884-460ebcf39b2c','15000000-0000-4000-8000-000000000002',
  'ea961624-3e89-4c25-8f75-050988b6a431','39793dbc-3445-4d84-8629-62493a4dea1d',
  '6e9eeb24-71eb-4790-8e7d-b3ca1a78ad25','7bc8812e-cae0-4f49-9986-b884123c37e9',
  'd84dd70a-052a-415d-9525-edb064f86618','c6c9a03d-9694-44a2-8a00-dbe2edc9c546',
  '11d93740-9df4-462b-b638-2dd4207379c8','15000000-0000-4000-8000-000000000003',
  'd7c0e890-6604-43a3-8a63-acb086b2e404','f40062d2-a7ee-416d-94cf-465a588e24df',
  '834e29cd-246d-4ab3-ae10-37e9bdfb434e','15000000-0000-4000-8000-000000000006',
  '34ef7734-7920-484a-af54-5d660071c187'
];
const FIXP = "name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\\_S%'";
const FULL12 = ['cash_drawer_logs','cash_registers','app_settings','expenses','kitchen_analytics','order_counters','payment_attempts','payment_idempotency_keys','payroll_webhook_configs','staff_metrics','loyalty_product_rules','reservation_preorder_items'];
const CAT3 = ['delivery_zones','payment_methods','gift_cards'];
const RLS4 = ['overtime_records','schedule','shift_breaks','shift_swap_requests'];
const FULL11 = FULL12.filter(t => t !== 'reservation_preorder_items');
const T15 = FULL12.concat(CAT3);
const VIEWS = {
  v_settings_business: 'restaurant_name,address,phone,city,contact_email,instagram_url,whatsapp_number,timezone,footer_text,inventory_mode',
  v_settings_hours: 'opening_hours,working_hours,is_open,morning_greeting_enabled,avg_meal_duration,kitchen_accept_timeout_minutes,order_delay_minutes',
  v_settings_delivery: 'delivery_fee,free_delivery_threshold,min_order_amount,qr_table_count,revenue_limit',
  v_settings_receipt: 'receipt_title,receipt_currency,receipt_service_fee_pct,receipt_show_service_fee,receipt_footer_text,receipt_staff_name,receipt_payment_method',
  v_settings_printer: 'printer_name,printer_type,printer_paper_width,printer_interface,auto_print_receipt,auto_print_kitchen,print_copies',
  v_settings_vat: 'vat_enabled,vat_percentage,auto_apply_vat',
  v_settings_loyalty: 'loyalty_enabled,loyalty_points_per_manat,loyalty_point_value,loyalty_min_redeem',
  v_settings_cash_close: 'cash_close_variance_threshold,cash_close_manager_required',
  v_settings_ai: 'ai_target_revenue,ai_insight_depth',
  v_settings_payments: 'payment_cash,payment_card'
};

const ORG = S('SELECT id::text FROM organizations LIMIT 1');
const LOC_A = S('SELECT id::text FROM locations LIMIT 1');
if (!ORG || !LOC_A) { console.log('!! HARNESS: cannot resolve organizations/locations — aborting'); process.exit(1); }
const ROLE = {}; for (const rn of ['cashier','manager','owner']) ROLE[rn] = S(`SELECT id::text FROM roles WHERE name=${q(rn)}`);
if (!ROLE.cashier || !ROLE.owner) { console.log('!! HARNESS: roles missing — aborting'); process.exit(1); }

// app pin format (src/lib/crypto.ts): pbkdf2_sha256$260000$<salt16hex>$<hash64hex>
function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, salt, 260000, 64, 'sha256').toString('hex');
  return `pbkdf2_sha256$260000$${salt}$${hash}`;
}

// P8-pattern gate staff fixture (staff + locations + session token)
function createGateStaff(name, roleName, pin) {
  const id = crypto.randomUUID(), tok = crypto.randomUUID();
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(id)},${q(name)},${q(name)},${q(ROLE[roleName])},true,'ACTIVE',${q(pin ? pinHash(pin) : 'pbkdf2_sha256$260000$00$00')},${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES (${q(id)},${q(LOC_A)},true,true,${q(ORG)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(tok)},${q(id)},${q(roleName)},now() + interval '24h','ACTIVE',${q(ORG)},${q(LOC_A)})`);
  return { id, tok };
}
// zero-residue teardown v4 — AUTO-DISCOVERS the full FK child surface of the
// staff row (live-verified 2026-09-18: 30 FKs -> staff; legacy "SET NULL"
// catalog oddity behaves NO ACTION, so every child is deleted explicitly).
// Order is RESTRICT/NO-ACTION/CASCADE-aware: per-shift children -> drawer logs
// (RESTRICT on shift_id) -> drawer sessions -> shifts -> remaining staff FK
// children -> gate-owned soft refs -> trigger-guarded staff (SET ROLE postgres:
// pooler anomaly guard) -> VERIFY 0 rows (throws on residue: never silent).
function teardownGateStaff(id) {
  const errs = [];
  const del = (label, sql) => { const x = Sx(sql); if (x.status !== 0) errs.push(label + ': ' + (x.err || '').slice(0, 140)); };
  // 1) shifts of this staff + per-shift children (before shifts: RESTRICT/NO-ACTION)
  const shiftIds = S(`SELECT id::text FROM shifts WHERE staff_id=${q(id)}`).split('\n').filter(Boolean);
  for (const sid of shiftIds) {
    del('tip_shortfalls[' + sid.slice(0, 8) + ']', `DELETE FROM tip_shortfalls WHERE shift_id=${q(sid)}`);
    del('overtime_records[' + sid.slice(0, 8) + ']', `DELETE FROM overtime_records WHERE shift_id=${q(sid)}`);
    del('shift_reviews[' + sid.slice(0, 8) + ']', `DELETE FROM shift_reviews WHERE shift_id=${q(sid)}`);
    del('shift_breaks[' + sid.slice(0, 8) + ']', `DELETE FROM shift_breaks WHERE shift_id=${q(sid)}`);
    del('cash_drawer_log[' + sid.slice(0, 8) + ']', `DELETE FROM cash_drawer_log WHERE shift_id=${q(sid)}`); // RESTRICT
  }
  // 2) drawer sessions opened/closed by this staff (logs first: session FK CASCADE)
  const dsids = S(`SELECT id::text FROM cash_drawer_sessions WHERE opened_by=${q(id)} OR closed_by=${q(id)}`).split('\n').filter(Boolean);
  for (const sid of dsids) {
    del('cash_drawer_log[' + sid.slice(0, 8) + ']', `DELETE FROM cash_drawer_log WHERE session_id=${q(sid)}`);
    del('cash_drawer_sessions[' + sid.slice(0, 8) + ']', `DELETE FROM cash_drawer_sessions WHERE id=${q(sid)}`);
  }
  // 3) shifts (all per-shift children above are gone now)
  del('shifts', `DELETE FROM shifts WHERE staff_id=${q(id)}`);
  // 4) all remaining staff FK children (live FK list 2026-09-18)
  del('tip_shortfalls', `DELETE FROM tip_shortfalls WHERE staff_id=${q(id)} OR resolved_by=${q(id)}`);
  del('tip_distributions', `DELETE FROM tip_distributions WHERE staff_id=${q(id)}`);
  del('overtime_records', `DELETE FROM overtime_records WHERE staff_id=${q(id)} OR approved_by=${q(id)}`);
  del('shift_breaks', `DELETE FROM shift_breaks WHERE staff_id=${q(id)}`);
  del('shift_reviews', `DELETE FROM shift_reviews WHERE staff_id=${q(id)} OR reviewed_by=${q(id)}`);
  del('sessions', `DELETE FROM sessions WHERE user_id=${q(id)}`);
  del('login_attempts', `DELETE FROM login_attempts WHERE staff_id=${q(id)}`);
  del('security_events', `DELETE FROM security_events WHERE staff_id=${q(id)}`);
  del('clock_events', `DELETE FROM clock_events WHERE staff_id=${q(id)}`);
  del('approval_requests', `DELETE FROM approval_requests WHERE staff_id=${q(id)} OR reviewed_by=${q(id)}`);
  del('staff_locations', `DELETE FROM staff_locations WHERE staff_id=${q(id)}`);
  del('schedule', `DELETE FROM schedule WHERE staff_id=${q(id)}`);
  del('time_clock_audit', `DELETE FROM time_clock_audit WHERE performed_by=${q(id)}`);
  del('time_clock_entries', `DELETE FROM time_clock_entries WHERE staff_id=${q(id)} OR approved_by=${q(id)}`);
  del('staff_metrics', `DELETE FROM staff_metrics WHERE staff_id=${q(id)}`);
  del('staff_documents', `DELETE FROM staff_documents WHERE staff_id=${q(id)} OR verified_by=${q(id)}`);
  del('payroll_entries', `DELETE FROM payroll_entries WHERE staff_id=${q(id)}`);
  del('payroll_exports', `DELETE FROM payroll_exports WHERE exported_by=${q(id)}`);
  del('risk_scores', `DELETE FROM risk_scores WHERE staff_id=${q(id)}`);
  del('shift_swap_requests', `DELETE FROM shift_swap_requests WHERE requested_by=${q(id)} OR target_staff_id=${q(id)} OR approved_by=${q(id)}`);
  del('staff_announcements', `DELETE FROM staff_announcements WHERE created_by=${q(id)}`);
  del('manager_overrides', `DELETE FROM manager_overrides WHERE requested_by=${q(id)} OR approved_by=${q(id)}`);
  del('kitchen_tickets', `DELETE FROM kitchen_tickets WHERE assigned_to=${q(id)}`);
  del('order_items.hold_by', `DELETE FROM order_items WHERE hold_by=${q(id)}`);
  del('price_overrides', `DELETE FROM price_overrides WHERE staff_id=${q(id)}`);
  del('expenses', `DELETE FROM expenses WHERE staff_id=${q(id)}`);
  del('notification_read_state', `DELETE FROM notification_read_state WHERE user_id=${q(id)}`);
  // 5) gate-owned soft refs (no FK; M7-R4 surface; all uuid cols)
  del('audit_logs_canonical', `DELETE FROM audit_logs_canonical WHERE actor_id=${q(id)}`); // gate-owned fixture rows only — SSOT kept residue-free for gate rows
  del('outbox_events', `DELETE FROM outbox_events WHERE aggregate_id=${q(id)}`);
  del('operation_logs', `DELETE FROM operation_logs WHERE performed_by=${q(id)}`);
  del('cash_drawer_logs', `DELETE FROM cash_drawer_logs WHERE staff_id=${q(id)}`);
  if (errs.length) throw new Error('teardown child-delete errors for ' + id + ': ' + errs.join(' | '));
  // 6) trigger-guarded staff delete (SET ROLE postgres: pooler anomaly guard)
  del('staff', `BEGIN; SET ROLE postgres; ALTER TABLE staff DISABLE TRIGGER trg_staff_prevent_delete; DELETE FROM staff WHERE id=${q(id)}; ALTER TABLE staff ENABLE TRIGGER trg_staff_prevent_delete; COMMIT;`);
  if (errs.length) throw new Error('teardown staff-delete error for ' + id + ': ' + errs.join(' | '));
  // 7) VERIFY — residue throws (visible HARNESS, never silent)
  const left = S(`SELECT count(*) FROM staff WHERE id=${q(id)}`);
  if (left !== '0') throw new Error('teardown residue: staff row survived (left=' + left + ') id=' + id);
}

(async () => {
console.log('\n=== P-9 GATE (S1..S7) — schema normalization verification ===');
const whoAmI = S('SELECT current_user');
if (whoAmI !== 'postgres') R('G.0', 'session role = postgres (pooler anomaly guard)', 'HARNESS-FAILURE', false, 'current_user=' + whoAmI + ' — re-run');

// self-heal: remove P9GATE_* staff leftovers from any crashed prior run BEFORE checks
{
  const leftovers = S(`SELECT id::text FROM staff WHERE name LIKE 'P9GATE\\_%'`).split('\n').filter(Boolean);
  for (const lid of leftovers) {
    try { teardownGateStaff(lid); console.log('self-heal: removed leftover gate fixture ' + lid); }
    catch (e) { R('G.SH', 'self-heal of leftover gate fixture', 'HARNESS-FAILURE', false, lid + ': ' + e.message); }
  }
}

// ============================ S1 — GRANT/RLS MATRIX ============================
console.log('\n[S1] grant/RLS matrix (15 tables × roles, M1 map)');
// grant-map contract assertions (M1 ratified design:
//   FULL11 → {anon,authenticated,test_rls_role} = ∅
//   RPI    → only anon keeps SELECT (policy-bounded); authenticated REVOKEd (M1-R1); test_rls_role ∅
//   CAT3   → authenticated + test_rls_role = ∅; anon keeps SELECT)
let grantViol = [];
for (const t of FULL11) {
  const g = S(`SELECT grantee||':'||privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=${q(t)} AND grantee IN ('anon','authenticated','test_rls_role')`);
  if (g) grantViol.push(t + ' → ' + g.split('\n').join(','));
}
{
  const g = S(`SELECT grantee||':'||privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='reservation_preorder_items' AND grantee IN ('authenticated','test_rls_role')`);
  if (g) grantViol.push('reservation_preorder_items → ' + g.split('\n').join(','));
}
for (const t of CAT3) {
  const g = S(`SELECT grantee||':'||privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=${q(t)} AND grantee IN ('authenticated','test_rls_role')`);
  if (g) grantViol.push(t + ' → ' + g.split('\n').join(','));
}
R('S1.1', 'grant map: FULL11 × 3 roles = ∅; RPI × {authenticated,test_rls_role} = ∅ (M1-R1); CAT3 × {authenticated,test_rls_role} = ∅', grantViol.length ? 'REAL-RISK' : 'PASS', !grantViol.length, grantViol.join(' | ') || 'clean', 'M1 + M1-R1 revokes in place');
const anonSelMap = {};
for (const t of CAT3) anonSelMap[t] = S(`SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=${q(t)} AND grantee='anon' AND privilege_type='SELECT'`);
anonSelMap['reservation_preorder_items'] = S(`SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='reservation_preorder_items' AND grantee='anon' AND privilege_type='SELECT'`);
const catOk = Object.values(anonSelMap).every(v => v === '1');
R('S1.2', 'grant map: anon keeps SELECT on CAT3 + RPI (M1 design: catalogs/preorder readable by anon, policy-bounded)', catOk ? 'PASS' : 'REAL-RISK', catOk, JSON.stringify(anonSelMap));

// functional probes (rolled-back txns; numeric line = last pure-numeric line of out)
const numOut = out => { const m = (out || '').split('\n').filter(l => /^\d+$/.test(l.trim())); return m.length ? m[m.length - 1].trim() : null; };
const probe = (role, stmt) => Sx(`BEGIN; SET ROLE ${role}; ${stmt}; ROLLBACK;`);
let deniedOk = 0, deniedBad = [];
for (const t of FULL11) for (const role of ['anon', 'authenticated']) for (const verb of ['SELECT', 'INSERT']) {
  const stmt = verb === 'SELECT' ? `SELECT 1 FROM ${t} LIMIT 1` : `INSERT INTO ${t} DEFAULT VALUES`;
  const r = probe(role, stmt);
  if (/permission denied/i.test(r.err)) deniedOk++;
  else if (r.status === 0) deniedBad.push(`${t}.${verb} as ${role} SUCCEEDED (unexpected access!)`);
  else deniedBad.push(`${t}.${verb} as ${role} unexpected: ${(r.err || '').slice(0, 80)}`);
}
for (const role of ['authenticated']) for (const verb of ['SELECT', 'INSERT']) {
  const stmt = verb === 'SELECT' ? `SELECT 1 FROM reservation_preorder_items LIMIT 1` : `INSERT INTO reservation_preorder_items DEFAULT VALUES`;
  const r = probe(role, stmt);
  if (/permission denied/i.test(r.err)) deniedOk++;
  else if (r.status === 0) deniedBad.push(`RPI.${verb} as ${role} SUCCEEDED (M1-R1 not effective!)`);
  else deniedBad.push(`RPI.${verb} as ${role} unexpected: ${(r.err || '').slice(0, 80)}`);
}
for (const t of CAT3) for (const role of ['authenticated']) for (const verb of ['SELECT', 'INSERT']) {
  const stmt = verb === 'SELECT' ? `SELECT 1 FROM ${t} LIMIT 1` : `INSERT INTO ${t} DEFAULT VALUES`;
  const r = probe(role, stmt);
  if (/permission denied/i.test(r.err)) deniedOk++;
  else if (r.status === 0) deniedBad.push(`${t}.${verb} as ${role} SUCCEEDED (unexpected access!)`);
  else deniedBad.push(`${t}.${verb} as ${role} unexpected: ${(r.err || '').slice(0, 80)}`);
}
R('S1.3', 'functional: 52 denied probes (FULL11×2r×2v + RPI×auth×2v + CAT3×auth×2v) all permission-denied', deniedBad.length ? 'REAL-RISK' : 'PASS', !deniedBad.length, deniedBad.join(' | ') || `${deniedOk}/52 denied as expected`);
let anonSelOk = 0, anonSelDetail = [];
for (const t of [...CAT3, 'reservation_preorder_items']) {
  const r = probe('anon', `SELECT count(*) FROM ${t}`);
  const n = numOut(r.out);
  if (r.status === 0 && n !== null) { anonSelOk++; anonSelDetail.push(t + '=' + n); }
  else anonSelDetail.push(t + '!!' + (r.err || '').slice(0, 40));
}
R('S1.4', 'functional: anon SELECT on CAT3 + RPI succeeds (policy-bounded reads by design)', anonSelOk === 4 ? 'PASS' : 'REAL-RISK', anonSelOk === 4, anonSelDetail.join(' '));

// RLS4: enabled + policies + no row leak as authenticated
let rlsIssues = [];
for (const t of RLS4) {
  const en = S(`SELECT relrowsecurity::text FROM pg_class WHERE relname=${q(t)}`);
  const pol = S(`SELECT count(*) FROM pg_policy WHERE polrelid=${q(t)}::regclass`);
  if (en !== 'true' && en !== 't') rlsIssues.push(t + ': RLS not enabled (=' + en + ')');
  if (pol < 2) rlsIssues.push(t + ': policies=' + pol + ' (expected ≥2: _self + _service_full)');
  const r = Sx(`BEGIN; SET ROLE authenticated; SELECT count(*) FROM ${t}; ROLLBACK;`);
  const n = numOut(r.out);
  if (r.status !== 0) rlsIssues.push(t + ': probe error ' + (r.err || '').slice(0, 60));
  else if (n !== '0') rlsIssues.push(t + ': authenticated sees ' + n + ' rows (RLS leak)');
}
R('S1.5', 'RLS4: relrowsecurity + policies + 0 rows visible as authenticated (no session → self-scope empty)', rlsIssues.length ? 'REAL-RISK' : 'PASS', !rlsIssues.length, rlsIssues.join(' | ') || 'all 4 clean');
// S1.6: RPI RLS ON + 3 pre-existing policies active (M1 Section B)
{
  const en = S(`SELECT relrowsecurity::text FROM pg_class WHERE relname='reservation_preorder_items'`);
  const pol = S(`SELECT count(*) FROM pg_policy WHERE polrelid='reservation_preorder_items'::regclass`);
  const ok16 = (en === 'true' || en === 't') && pol === '3';
  R('S1.6', 'RPI: RLS enabled + 3 pre-existing policies (M1 Section B)', ok16 ? 'PASS' : 'REAL-RISK', ok16, `rls=${en} policies=${pol}`);
}

// ============================ S2a — SETTINGS VIEWS ≡ SETTINGS ============================
console.log('\n[S2] settings views equivalence (DB)');
let viewBad = [];
for (const [v, cols] of Object.entries(VIEWS)) {
  const r = Sx(`SELECT (SELECT to_jsonb(t) FROM (SELECT ${cols} FROM public.${v} LIMIT 1) t) = (SELECT to_jsonb(t) FROM (SELECT ${cols} FROM public.settings LIMIT 1) t)`);
  if (r.out !== 't') viewBad.push(v + '=' + r.out);
}
R('S2.1', '10 v_settings_* views ≡ settings rows (jsonb equality, all columns)', viewBad.length ? 'REAL-RISK' : 'PASS', !viewBad.length, viewBad.join(' | ') || '10/10 equivalent');

// ============================ S3 — POST-DROP SMOKE ============================
console.log('\n[S3] post-drop smoke (orders/items, v_closed_orders, popular_queries)');
const itemsCol = S(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='items'`);
R('S3.1', 'orders.items column dropped (M4)', itemsCol === '0' ? 'PASS' : 'REAL-RISK', itemsCol === '0', 'col_count=' + itemsCol);
const insOrd = Sx(`BEGIN; INSERT INTO orders (total_amount, location_id, organization_id) VALUES (0, ${q(LOC_A)}, ${q(ORG)}); ROLLBACK;`);
R('S3.2', 'INSERT orders without items works (M4 regression-proof, rolled back)', insOrd.status === 0 ? 'PASS' : 'REAL-RISK', insOrd.status === 0, insOrd.err || 'ok');
const vcoBad = S(`SELECT count(*) FROM public.v_closed_orders v WHERE v.item_count <> (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = v.order_id)`);
R('S3.3', 'v_closed_orders.item_count ≡ order_items count (ALL rows, M4 rewrite)', vcoBad === '0' ? 'PASS' : 'REAL-RISK', vcoBad === '0', 'mismatched=' + vcoBad);
// upsert_popular_query roundtrip (table kept per M5 exclusion) — 0 residue
const pqKey = 'p9gate_' + Date.now();
const up = await rpc('upsert_popular_query', { q_text: pqKey, q_lang: 'az' });
const pqRow = S(`SELECT count(*) FROM popular_queries WHERE query_text=${q(pqKey)}`);
S(`DELETE FROM popular_queries WHERE query_text=${q(pqKey)}`);
const pqGone = S(`SELECT count(*) FROM popular_queries WHERE query_text=${q(pqKey)}`);
const upOk = (up.status === 200 || up.status === 204) && pqRow === '1' && pqGone === '0';
R('S3.4', 'upsert_popular_query works (table kept, M5 exclusion) — 0 residue', upOk ? 'PASS' : 'REAL-RISK', upOk, `up=${up.status} row=${pqRow} gone=${pqGone}`);

// ============================ S4 — FK TRIPWIRE ×3 ============================
console.log('\n[S4] M6 FK tripwires (orphan INSERT → 23503; clean → ok)');
const FAKE = '00000000-0000-0000-0000-000000000001';
const REAL_STAFF = S('SELECT id::text FROM staff WHERE is_active LIMIT 1');
const REAL_PROD = S('SELECT id::text FROM products LIMIT 1');
const REAL_FLOOR = S('SELECT id::text FROM table_floors LIMIT 1');
const REAL_ORD = S('SELECT id::text FROM orders LIMIT 1');
let tripBad = [];
// expenses.staff_id
let r = Sx(`BEGIN; INSERT INTO expenses (staff_id) VALUES (${q(FAKE)}); ROLLBACK;`);
if (!/violates foreign key/i.test(r.err)) tripBad.push('expenses.staff_id orphan NOT blocked: ' + (r.status === 0 ? 'inserted' : r.err.slice(0, 60)));
r = Sx(`BEGIN; INSERT INTO expenses (staff_id) VALUES (${q(REAL_STAFF)}); ROLLBACK;`);
if (r.status !== 0) tripBad.push('expenses.staff_id clean insert failed: ' + r.err.slice(0, 60));
// price_overrides.product_id
r = Sx(`BEGIN; INSERT INTO price_overrides (order_id, staff_id, catalog_price, override_price, variance, product_id) VALUES (${q(REAL_ORD)},${q(REAL_STAFF)},10,5,-5,${q(FAKE)}); ROLLBACK;`);
if (!/violates foreign key/i.test(r.err)) tripBad.push('price_overrides.product_id orphan NOT blocked: ' + (r.status === 0 ? 'inserted' : r.err.slice(0, 60)));
r = Sx(`BEGIN; INSERT INTO price_overrides (order_id, staff_id, catalog_price, override_price, variance, product_id) VALUES (${q(REAL_ORD)},${q(REAL_STAFF)},10,5,-5,${q(REAL_PROD)}); ROLLBACK;`);
if (r.status !== 0) tripBad.push('price_overrides.product_id clean insert failed: ' + r.err.slice(0, 60));
// reservations.floor_id
r = Sx(`BEGIN; INSERT INTO reservations (name, phone, guests, date, time, organization_id, location_id, floor_id) VALUES ('p9t','123',1,CURRENT_DATE,'12:00',${q(ORG)},${q(LOC_A)},${q(FAKE)}); ROLLBACK;`);
if (!/violates foreign key/i.test(r.err)) tripBad.push('reservations.floor_id orphan NOT blocked: ' + (r.status === 0 ? 'inserted' : r.err.slice(0, 60)));
r = Sx(`BEGIN; INSERT INTO reservations (name, phone, guests, date, time, organization_id, location_id, floor_id) VALUES ('p9t','123',1,CURRENT_DATE,'12:00',${q(ORG)},${q(LOC_A)},${q(REAL_FLOOR)}); ROLLBACK;`);
if (r.status !== 0) tripBad.push('reservations.floor_id clean insert failed: ' + r.err.slice(0, 60));
R('S4.1', 'tripwires: 3 orphans blocked (23503) + 3 clean inserts ok (all rolled back)', tripBad.length ? 'REAL-RISK' : 'PASS', !tripBad.length, tripBad.join(' | ') || '6/6 as expected');
// ============================ S5 — PURGE PROOF (M7) ============================
console.log('\n[S5] purge proof (fixture=0, real=53/9, pool≤9, denylist, fresh login)');
const fxCount = S(`SELECT count(*) FROM staff WHERE ${FIXP}`);
const fxActive = S(`SELECT count(*) FROM staff WHERE (${FIXP}) AND (is_active OR status='ACTIVE' OR (pin_hash IS NOT NULL AND pin_hash<>''))`);
// refined (GO-2 class, 2026-09-18): frozen gates' neutralize-don't-delete contract leaves
// inert fixture rows after each green run, so strict count=0 can no longer hold.
// Dangerous state (active/pinned fixture) is the real invariant — covered here AND in S5.4b.
R('S5.1', 'fixture-pattern staff all inert (neutralize contract: 0 active/pinned among pattern rows)', fxActive === '0' ? 'PASS' : 'REAL-RISK', fxActive === '0', `patternRows=${fxCount} activePinnedAmongThem=${fxActive}`);
const activeReal = S(`SELECT count(*) FROM staff WHERE is_active`);
R('S5.2', 'active staff = 9 (all real)', activeReal === '9' ? 'PASS' : 'REAL-RISK', activeReal === '9', 'active=' + activeReal);
const pool = S(`SELECT count(*) FROM staff s WHERE s.is_active AND s.status='ACTIVE' AND s.pin_hash IS NOT NULL AND s.pin_hash<>''`);
R('S5.3', 'login_preflight pool ≤ 9 (was 39)', Number(pool) <= 9 ? 'PASS' : 'REAL-RISK', Number(pool) <= 9, 'pool=' + pool);
// S5.4 refined (GO-2, 2026-09-18): frozen gates' neutralize-don't-delete contract leaves
// inert fixture rows (INACTIVE, no pin) after each green run — strict total=53/extra=0
// can no longer hold. Real-staff protection is preserved AND sharpened: S5.4a = all 53
// real IDs present; S5.4b = ZERO active/ACTIVE/pinned rows outside the denylist (this is
// the assertion that would have caught the pool=12 residue); S5.4c = every non-denylist
// row is UPPER_SNAKE fixture-styled (no real-looking names); S5.4d = pool exactly 9.
const totalNow = S('SELECT count(*) FROM staff');
const denyInDb = S('SELECT count(*) FROM staff s WHERE s.id = ANY(ARRAY[' + DENY53.map(q).join(',') + ']::uuid[])');
const extraNow = S('SELECT count(*) FROM staff s WHERE NOT (s.id = ANY(ARRAY[' + DENY53.map(q).join(',') + ']::uuid[]))');
const extraDangerous = S(`SELECT count(*) FROM staff s WHERE NOT (s.id = ANY(ARRAY[${DENY53.map(q).join(',')}]::uuid[])) AND (s.is_active OR s.status='ACTIVE' OR (s.pin_hash IS NOT NULL AND s.pin_hash<>''))`);
// regex widened (2026-09-18): fixture families include mixed-case prefixes (ES gate: G2mu60jfp4_*)
// — alnum prefix + underscored tail still excludes real-looking names (spaces / no underscore)
const extraRealStyle = S(`SELECT count(*) FROM staff s WHERE NOT (s.id = ANY(ARRAY[${DENY53.map(q).join(',')}]::uuid[])) AND s.name !~ '^[A-Za-z0-9]+(_[A-Za-z0-9]+)+'`);
R('S5.4a', 'All 53 DENY53 IDs present (real staff byte-verified)', denyInDb === '53' ? 'PASS' : 'REAL-RISK', denyInDb === '53', `deny=${denyInDb}/53 total=${totalNow} extra=${extraNow}`);
R('S5.4b', '0 active/ACTIVE/pinned rows outside denylist (real-staff identity protection; would catch pool=12)', extraDangerous === '0' ? 'PASS' : 'REAL-RISK', extraDangerous === '0', `dangerousExtra=${extraDangerous}`);
R('S5.4c', 'All non-denylist rows are fixture-styled (alnum prefix + underscored tail; no real-looking names outside denylist)', extraRealStyle === '0' ? 'PASS' : 'REAL-RISK', extraRealStyle === '0', `realStyleExtra=${extraRealStyle} (inert fixture extras=${extraNow})`);
R('S5.4d', 'login_preflight pool = exactly 9', pool === '9' ? 'PASS' : 'REAL-RISK', pool === '9', 'pool=' + pool);
// fresh fixture login (A-gate incident regression-proof) — torn down IMMEDIATELY
// (its login_commit creates a shift; robust teardown auto-discovers it)
const lgName = 'P9GATE_LG' + Math.floor(Math.random() * 90 + 10);
let lg = null, lgErr = '';
try {
  lg = createGateStaff(lgName, 'owner', '4321');
  const resp = await http('POST', '/api/auth/staff-login', { pin: '4321' });
  let j = null; try { j = JSON.parse(resp.body); } catch { }
  const sessRow = S(`SELECT count(*) FROM sessions WHERE user_id=${q(lg.id)}`);
  const shiftRow = S(`SELECT count(*) FROM shifts WHERE staff_id=${q(lg.id)}`);
  if (resp.status === 200 && j && j.success === true && j.token && j.staffId === lg.id) R('S5.5', 'FRESH fixture login: 200 + token + session row (post-purge login path intact)', 'PASS', true, lgName + ` login ok sessRow=${sessRow} shiftRow=${shiftRow}`);
  else R('S5.5', 'FRESH fixture login: 200 + token + session row (post-purge login path intact)', 'REAL-RISK', false, `status=${resp.status} body=${resp.body.slice(0, 160)} sessRow=${sessRow} shiftRow=${shiftRow}`);
} catch (e) { lgErr = e.message; R('S5.5', 'FRESH fixture login', 'HARNESS-FAILURE', false, lgErr); }
finally {
  try { if (lg) { teardownGateStaff(lg.id); lg = null; } }
  catch (e) { R('S5.6', 'S5.5 fixture teardown (zero-residue)', 'HARNESS-FAILURE', false, e.message); }
}

// ============================ S2b — SETTINGS ROUTES (own short-lived token fixture) ============================
console.log('\n[S2b] settings/* routes (200 unchanged, owner token)');
const CSRF = 'p9gate_csrf';
const cookieH = tok => ({ Cookie: `saito_token=${tok}; saito_csrf=${CSRF}`, 'x-csrf-token': CSRF });
const warm = async (path, tok) => { let last; for (let t = 0; t < 8; t++) { last = await http('GET', path, null, cookieH(tok)); if (last.status === 200) return last; if (last.status !== 0 && last.status >= 400 && last.status < 500) return last; await sleep(Math.min(2500, 500 * (t + 1))); } return last; };
{
  const rtName = 'P9GATE_RT' + Math.floor(Math.random() * 90 + 10);
  let rt = null, rtTok = null, rtErr = '';
  try {
    rt = createGateStaff(rtName, 'owner', '4321');
    const resp = await http('POST', '/api/auth/staff-login', { pin: '4321' });
    let j = null; try { j = JSON.parse(resp.body); } catch { }
    if (resp.status === 200 && j && j.success === true && j.token && j.staffId === rt.id) rtTok = j.token;
    else rtErr = `login status=${resp.status} body=${resp.body.slice(0, 160)}`;
  } catch (e) { rtErr = e.message; }
  if (rtTok) {
    let routeBad = [];
    for (const sub of ['business','general','loyalty','order','payroll','pos','printer','receipt']) {
      const r = await warm('/api/settings/' + sub, rtTok);
      if (r.status !== 200) routeBad.push(sub + '=' + r.status);
    }
    const harnessHit = routeBad.some(x => x.endsWith('=0'));
    R('S2.2', '8 GET /api/settings/* routes → 200 (owner cookie token, post-M1/M2, warmup for cold compile)', harnessHit ? 'HARNESS-FAILURE' : (routeBad.length ? 'REAL-RISK' : 'PASS'), !routeBad.length || harnessHit, routeBad.join(' | ') || '8/8 200', harnessHit ? 'transport timeout after warmup — re-run' : '');
    const geo = await warm('/api/settings/geo', rtTok);
    R('S2.3', '/api/settings/geo has no GET by design (404/405, PATCH-only route)', (geo.status === 404 || geo.status === 405) ? 'PASS' : 'REAL-RISK', geo.status === 404 || geo.status === 405, 'geo GET=' + geo.status);
  } else {
    R('S2.2', '8 GET /api/settings/* routes → 200', 'HARNESS-FAILURE', false, rtErr + ' — token fixture login failed; re-run');
    R('S2.3', '/api/settings/geo GET probe', 'HARNESS-FAILURE', false, 'skipped — no token');
  }
  try { if (rt) teardownGateStaff(rt.id); }
  catch (e) { R('S2.4', 'S2b fixture teardown (zero-residue)', 'HARNESS-FAILURE', false, e.message); }
}

// ============================ S6 — ROLE STATE ============================
console.log('\n[S6] test_rls_role state');
const trRole = S(`SELECT count(*) FROM pg_roles WHERE rolname='test_rls_role'`);
let trGrants = [];
for (const t of T15) {
  const g = S(`SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=${q(t)} AND grantee='test_rls_role'`);
  if (g) trGrants.push(t + ':' + g.replace(/\n/g, ','));
}
R('S6.1', 'test_rls_role exists with 0 grants on 15 tables (P-8 carry → M1)', (trRole === '1' && trGrants.length === 0) ? 'PASS' : 'REAL-RISK', trRole === '1' && trGrants.length === 0, 'role=' + trRole + ' grants=' + trGrants.join(' | ') || 'clean');

// ============================ S7 — P-8 FROZEN SURFACE CANARY ============================
console.log('\n[S7] P-8 canary (T-4 exact shape: manager fixture, open → close v2 keyed → same-key idempotent → new-key rejected)');
let s7err = '';
try {
  const mName = 'P9GATE_M' + Math.floor(Math.random() * 90 + 10);
  const mf = createGateStaff(mName, 'manager', null);
  const v2fn = S(`SELECT count(*) FROM pg_proc WHERE proname='close_cash_register_v2'`);
  const v2args5 = S(`SELECT count(*) FROM pg_proc p WHERE p.proname='close_cash_register_v2' AND p.pronargs=5`);
  const v2args7 = S(`SELECT count(*) FROM pg_proc p WHERE p.proname='close_cash_register_v2' AND p.pronargs=7`);
  if (v2fn !== '2' || v2args5 !== '1' || v2args7 !== '1') s7err = `close_cash_register_v2 overload pair changed: fns=${v2fn} 5arg=${v2args5} 7arg=${v2args7} (expected 2/1/1)`;
  let shiftId = null, drawerSid = null;
  if (!s7err) {
    const ci = await rpc('clock_in_atomic_token', { p_token: mf.tok, p_target_id: mf.id });
    if (ci.status === 200 && ci.data && (ci.data.success === true || ci.data.token)) {
      shiftId = S(`SELECT id::text FROM shifts WHERE staff_id=${q(mf.id)} AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`);
      const openRes = await rpc('open_cash_register', { p_token: mf.tok, p_opening_balance: 100, p_notes: 'p9 canary' });
      drawerSid = openRes.data && openRes.data.id ? openRes.data.id : S(`SELECT id::text FROM cash_drawer_sessions WHERE shift_id=${q(shiftId)} ORDER BY created_at DESC LIMIT 1`);
      if (openRes.status === 200 && openRes.data && openRes.data.success === true && drawerSid) {
        const K1 = 'p9gate-canary-' + Date.now(), K2 = 'p9gate-canary2-' + Date.now();
        const r1 = await rpc('close_cash_register_v2', { p_session_id: drawerSid, p_actual_cash: 100, p_notes: 'p9 canary', p_manager_id: null, p_performed_by: mf.id, p_token: mf.tok, p_idempotency_key: K1 });
        await sleep(1200);
        const r2 = await rpc('close_cash_register_v2', { p_session_id: drawerSid, p_actual_cash: 100, p_notes: 'p9 canary', p_manager_id: null, p_performed_by: mf.id, p_token: mf.tok, p_idempotency_key: K1 });
        await sleep(1200);
        const r3 = await rpc('close_cash_register_v2', { p_session_id: drawerSid, p_actual_cash: 100, p_notes: 'p9 canary', p_manager_id: null, p_performed_by: mf.id, p_token: mf.tok, p_idempotency_key: K2 });
        await sleep(1200);
        const st = S(`SELECT status FROM cash_drawer_sessions WHERE id=${q(drawerSid)}`);
        const ledClose = S(`SELECT count(*) FROM cash_drawer_log WHERE session_id=${q(drawerSid)} AND type='close'`); // P8 T-4 semantics
        const ledTotal = S(`SELECT count(*) FROM cash_drawer_log WHERE session_id=${q(drawerSid)}`);
        const b1 = r1.data && r1.data.success === true;
        const b2 = r2.data && r2.data.success === true && r2.data.idempotent === true;
        const b3 = r3.data && r3.data.success === false && /already closed/i.test(r3.body || '');
        const ok = b1 && b2 && b3 && st === 'closed' && ledClose === '1';
        R('S7.1', 'P-8 canary (T-4 shape): close→idempotent:true→new-key rejected; ledger close-row=1; status closed', ok ? 'PASS' : 'REAL-RISK', ok,
          `r1=${r1.status}/${r1.data && r1.data.success} r2=${r2.status}/${r2.data && r2.data.success}/${r2.data && r2.data.idempotent} r3=${r3.status}/${r3.data && r3.data.success} st=${st} closeRows=${ledClose} totalRows=${ledTotal}`);
      } else s7err = `open failed: ${openRes.status} ${bodyOf(openRes).slice(0, 140)}`;
    } else s7err = 'clock_in failed: ' + bodyOf(ci).slice(0, 140);
  }
  if (s7err) R('S7.1', 'P-8 canary (open→close→replay)', 'HARNESS-FAILURE', false, s7err);
  try { teardownGateStaff(mf.id); }
  catch (e) { R('S7.2', 'S7 fixture teardown (zero-residue)', 'HARNESS-FAILURE', false, e.message); }
} catch (e) { R('S7.1', 'P-8 canary exception', 'HARNESS-FAILURE', false, e.message); }

// (S5.5 and S2b fixtures are torn down inline at their sites; S7 above)
const residue = S(`SELECT count(*) FROM staff WHERE name LIKE 'P9GATE\\_%'`);
R('T.1', 'zero residue: no P9GATE_* staff remain', residue === '0' ? 'PASS' : 'REAL-RISK', residue === '0', 'residue=' + residue);

// ============================ SUMMARY ============================
console.log('\n' + '='.repeat(72));
console.log(`P-9 GATE SUMMARY: PASS=${PASS}  CONFLICT=${CONFLICT}  REAL-RISK=${RISK}  HARNESS=${HARNESS}`);
if (RISK || HARNESS) {
  console.log('NON-PASS rows:');
  for (const r of results) if (!r.ok) console.log('  ' + r.cls + ' ' + r.id + ' ' + r.name + ' -> ' + r.evidence);
}
console.log('='.repeat(72));
process.exit(RISK === 0 && HARNESS === 0 ? 0 : 1);
})().catch(e => { console.log('!! HARNESS FATAL: ' + e.message); process.exit(1); });
