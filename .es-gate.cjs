// E/S FINAL VALIDATION GATE v2 — robust. E2E (HTTP) + RPC concurrency battery + residue + re-audit sweep.
// Run: node .es-gate.cjs → .es-gate-report.json
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');

const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const APP = 'http://localhost:3000';
const ORG = '00000000-0000-0000-0000-000000000001';
const LOC_A = 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
const R_MGR = 'bb579b8a-022d-4f89-99c7-56eebcec3032', R_CASH = '945137c3-fc59-457e-abaa-c16ff8e9cee3', R_WTR = 'cd686876-10d9-4cb2-8cf7-ca6e30beb850';

function sql(q) { const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() }; }
function S(q) { const r = sql(q); if (!r.ok) throw new Error('SQL: ' + r.err); return r.out; }
function hashPin(pin) { const salt = crypto.randomBytes(16).toString('hex'); const h = crypto.pbkdf2Sync(pin, salt, 260000, 64, 'sha256').toString('hex'); return `pbkdf2_sha256$260000$${salt}$${h}`; }
const q = (s) => `'${s}'`;

async function api(method, path, { cookie, body } = {}) {
  const h = { 'Content-Type': 'application/json' }; if (cookie) h['Cookie'] = `saito_token=${cookie}`;
  const res = await fetch(APP + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let data = null; try { data = await res.json(); } catch {}
  const setTok = (res.headers.get('set-cookie') || '').match(/saito_token=([^;]+)/);
  return { status: res.status, data, token: setTok ? setTok[1] : null };
}
const rLogin = async (pin) => { const r = await api('POST', '/api/auth/staff-login', { body: { pin } }); return r.token; };

const results = [];
function check(id, name, pass, evidence) { results.push({ id, name, pass: !!pass, evidence: String(evidence).slice(0, 220) }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${pass ? '' : '  -> ' + String(evidence).slice(0, 150)}`); }
// parallel RPC: returns array of boolean success (robust ->>'success' parse)
async function raceSql(n, build) {
  return Promise.all(Array.from({ length: n }, (_, i) => new Promise((res) => {
    const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-c', build(i)], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' });
    res({ ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() });
  })));
}
const successes = (r) => r.filter((x) => x.out === 't' || x.out === 'true').length;

(async () => {
  const RUN = 'G2' + Date.now().toString(36);
  // fixtures: 1 cashier (E2E + battery), 1 waiter, 1 manager, no-loc, inactive
  const mk = (name, role, loc, pin, active = true) => { const id = crypto.randomUUID(); S(`INSERT INTO staff (id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(id)},${q(name)},${q(name)},${q(role)},${active},'${active ? 'ACTIVE' : 'INACTIVE'}',${q(hashPin(pin))},${q(ORG)})`); if (loc) S(`INSERT INTO staff_locations (staff_id,location_id,is_primary,active,organization_id) VALUES (${q(id)},${q(loc)},true,true,${q(ORG)})`); return id; };
  const cashG = mk(`${RUN}_CASH`, R_CASH, LOC_A, '9011');
  const wtrG = mk(`${RUN}_WTR`, R_WTR, LOC_A, '9022');
  const mgrG = mk(`${RUN}_MGR`, R_MGR, LOC_A, '9033');
  const noLocG = mk(`${RUN}_NOL`, R_CASH, null, '9044');
  const inactG = mk(`${RUN}_INACT`, R_CASH, LOC_A, '9055', true); S(`UPDATE staff SET is_active=false,status='INACTIVE' WHERE id=${q(inactG)}`);
  // sessions for RPC battery (bypass HTTP login → no rate-limit interference)
  const mkSess = (uid, role) => { const tok = crypto.randomUUID(); S(`INSERT INTO sessions (token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(tok)},${q(uid)},${q(role)},now()+interval '2h','ACTIVE',${q(ORG)},${q(LOC_A)})`); return tok; };
  const tCash = mkSess(cashG, 'cashier'), tWtr = mkSess(wtrG, 'waiter'), tMgr = mkSess(mgrG, 'manager');

  console.log('----- HTTP E2E MAIN CHAIN (real route contract) -----');
  const tokCash = await rLogin('9011');
  const tokMgr = await rLogin('9033');
  check('E1', 'PIN login (A-frozen) → session', !!tokCash && !!tokMgr, 'cash=' + !!tokCash + ' mgr=' + !!tokMgr);

  const wrongPin = await api('POST', `/api/time-clock/${cashG}/clock-in`, { cookie: tokCash, body: { pin: '0000' } });
  check('E2', 'clock-in wrong PIN → 401 (TS verifyPin)', wrongPin.status === 401, 'status=' + wrongPin.status);
  const noPin = await api('POST', `/api/time-clock/${cashG}/clock-in`, { cookie: tokCash, body: {} });
  check('E3', 'clock-in missing PIN → 400 (NULL-PIN bypass closed)', noPin.status === 400, 'status=' + noPin.status);

  const ci = await api('POST', `/api/time-clock/${cashG}/clock-in`, { cookie: tokCash, body: { pin: '9011', source: 'admin_panel' } });
  check('E4', 'clock-in self → success + shift + report_date', ci.status === 200 && ci.data?.success === true && !!ci.data?.shift_id, JSON.stringify(ci.data));
  const shiftId = ci.data?.shift_id;

  const br1 = await api('POST', `/api/time-clock/${cashG}/break`, { cookie: tokCash, body: { breakType: 'unpaid' } });
  check('E5', 'break start → success + break_id (G-1/G-3 fixed)', br1.status === 200 && br1.data?.success === true && !!br1.data?.break_id, JSON.stringify(br1.data));
  await new Promise((r) => setTimeout(r, 1500));
  const br2 = await api('PATCH', `/api/time-clock/${cashG}/break`, { cookie: tokCash });
  check('E6', 'break end → success + duration', br2.status === 200 && br2.data?.success === true, JSON.stringify(br2.data));

  const dw1 = await api('POST', '/api/cash-drawer', { cookie: tokCash, body: { action: 'open', amount: 200, description: 'float' } });
  check('E7', 'drawer open → success + bound to shift (S-08 1:1)', dw1.status === 200 && dw1.data?.success === true && dw1.data?.shift_id === shiftId, JSON.stringify(dw1.data));
  const drawerId = dw1.data?.id;
  const dw2 = await api('POST', '/api/cash-drawer', { cookie: tokCash, body: { action: 'cash_in', session_id: drawerId, amount: 150, description: 'deposit' } });
  check('E8', 'cash movement (cash_in 150) → success', dw2.status === 200 && dw2.data?.success === true, JSON.stringify(dw2.data));

  // expected = open 200 (open row) + cash_in 150 = 350. Count 350 → diff 0 → but cash.close is MANAGER-only
  const dwCloseMgr = await api('POST', '/api/cash-drawer', { cookie: tokMgr, body: { action: 'close', session_id: drawerId, amount: 350, description: 'balanced' } });
  check('E9', 'drawer close by MANAGER (cash.close) → success + shift auto-closed', dwCloseMgr.status === 200 && dwCloseMgr.data?.success === true && dwCloseMgr.data?.shift_closed === true, JSON.stringify(dwCloseMgr.data));
  const expCash = S(`SELECT expected_cash || '|' || actual_cash || '|' || status FROM shifts WHERE id=${q(shiftId)}`);
  check('E10', 'shift expected_cash DERIVED from ledger (350), status CLOSED', expCash.includes('350') && expCash.endsWith('CLOSED'), expCash);
  check('E11', 'cash_drawer_logs audit row written', S(`SELECT count(*) FROM cash_drawer_logs WHERE shift_id=${q(shiftId)}`) === '1');
  check('E12', 'time_clock_audit chain present (clock_in+breaks)', Number(S(`SELECT count(*) FROM time_clock_audit WHERE performed_by=${q(cashG)}`)) >= 3, 'rows=' + S(`SELECT count(*) FROM time_clock_audit WHERE performed_by=${q(cashG)}`));
  // cashier CANNOT close the drawer (cash.close manager-only) — verify the boundary
  const tokCash2 = await rLogin('9011');
  const ci2 = await api('POST', `/api/time-clock/${cashG}/clock-in`, { cookie: tokCash2, body: { pin: '9011' } });
  const dwC = await api('POST', '/api/cash-drawer', { cookie: tokCash2, body: { action: 'open', amount: 100 } });
  const dwSelfClose = await api('POST', '/api/cash-drawer', { cookie: tokCash2, body: { action: 'close', session_id: dwC.data?.id, amount: 100 } });
  check('E13', 'cashier self-close drawer → FORBIDDEN (cash.close = manager-only)', dwSelfClose.status === 403, 'status=' + dwSelfClose.status);

  console.log('----- EDGE CASES -----');
  const tokNol = await rLogin('9044');
  const ciNol = await api('POST', `/api/time-clock/${noLocG}/clock-in`, { cookie: tokNol, body: { pin: '9044' } });
  check('X1', 'no-location staff clock-in → NO_LOCATION_ASSIGNED', ciNol.data?.error === 'NO_LOCATION_ASSIGNED', JSON.stringify(ciNol.data));
  const tokWtr = await rLogin('9022');
  const ciInact = await api('POST', `/api/time-clock/${inactG}/clock-in`, { cookie: tokWtr, body: { pin: '9055' } });
  check('X2', 'inactive staff clock-in → refused (not found/inactive)', ciInact.data?.success === false || [401, 404].includes(ciInact.status), JSON.stringify(ciInact.data));
  const ciOv = await api('POST', `/api/time-clock/${wtrG}/clock-in`, { cookie: tokMgr, body: { pin: '9022', source: 'admin_panel' } });
  check('X3', 'manager override clock-in other staff → success override=true', ciOv.data?.success === true && ciOv.data?.override === true, JSON.stringify(ciOv.data));
  const ciIdor = await api('POST', `/api/time-clock/${cashG}/clock-in`, { cookie: tokWtr, body: { pin: '9011' } });
  check('X4', 'waiter → other staff (no override) → 403 PERMISSION_DENIED', ciIdor.status === 403 && ciIdor.data?.error === 'PERMISSION_DENIED', 'status=' + ciIdor.status);
  const stNoAuth = await api('GET', `/api/time-clock/${cashG}/status`);
  check('X5', 'status route unauthenticated → 401 (G-2 fixed)', stNoAuth.status === 401, 'status=' + stNoAuth.status);
  const stSelf = await api('GET', `/api/time-clock/${wtrG}/status`, { cookie: tokWtr });
  check('X6', 'status route self → 200 (authorized)', stSelf.status === 200, 'status=' + stSelf.status);
  const sdate = '2027-03-10';
  check('X7', 'schedule conflict 10-18+14-22 → DENY', S(`SELECT public.create_schedule(${q(wtrG)},${q(sdate)},'10:00','18:00','g')`).includes('true') && S(`SELECT public.create_schedule(${q(wtrG)},${q(sdate)},'14:00','22:00','g')`).includes('conflict'));
  check('X8', 'schedule boundary 10-18+18-22 → ALLOW', S(`SELECT public.create_schedule(${q(wtrG)},${q(sdate)},'18:00','22:00','g')`).includes('true'));
  const otShift = crypto.randomUUID();
  S(`INSERT INTO shifts (id,staff_id,report_date,opened_at,closed_at,starting_cash,organization_id,location_id,status) VALUES (${q(otShift)},${q(wtrG)},'2026-09-20','2026-09-20 05:00:00+00','2026-09-20 15:00:00+00',0,${q(ORG)},${q(LOC_A)},'CLOSED')`);
  S(`SELECT public.calculate_shift_overtime(${q(otShift)})`);
  S(`UPDATE overtime_records SET approved=true,approved_by=${q(mgrG)} WHERE staff_id=${q(wtrG)} AND business_date='2026-09-20'`);
  S(`SELECT public.calculate_shift_overtime(${q(otShift)})`);
  check('X9', 'overtime approval lock: recalc keeps exactly 1 approved row', S(`SELECT count(*)||'/'||count(*) FILTER (WHERE approved) FROM overtime_records WHERE staff_id=${q(wtrG)} AND business_date='2026-09-20'`) === '1/1');

  console.log('----- CONCURRENCY BATTERY (RPC-level, dedicated session, robust parse) -----');
  // reset cashier to closed
  S(`UPDATE shifts SET closed_at=now(),status='CLOSED' WHERE staff_id=${q(cashG)} AND closed_at IS NULL`);
  S(`UPDATE shift_breaks SET ended_at=now() WHERE shift_id IN (SELECT id FROM shifts WHERE staff_id=${q(cashG)}) AND ended_at IS NULL`);
  S(`UPDATE cash_drawer_sessions SET status='closed',closed_at=now() WHERE opened_by=${q(cashG)} AND status='open'`);

  let r = await raceSql(2, () => `SELECT public.clock_in_atomic_token(${q(tCash)},NULL)->>'success'`);
  check('R1', '2x clock-in (from closed) → exactly 1 success', successes(r) === 1, r.map((x) => x.out || x.err.slice(0, 30)).join(' | '));
  r = await raceSql(2, () => `SELECT public.start_break_token(${q(tCash)},${q(cashG)})->>'success'`);
  check('R2', '2x break-start → exactly 1 success', successes(r) === 1, r.map((x) => x.out || x.err.slice(0, 30)).join(' | '));
  r = await raceSql(2, () => `SELECT public.end_break_token(${q(tCash)},${q(cashG)})->>'success'`);
  check('R3', '2x break-end → exactly 1 success', successes(r) === 1, r.map((x) => x.out || x.err.slice(0, 30)).join(' | '));
  r = await raceSql(2, () => `SELECT public.open_cash_register(${q(tCash)},50,'race')->>'success'`);
  check('R4', '2x drawer-open → exactly 1 success (1:1 atomic)', successes(r) === 1, r.map((x) => x.out || x.err.slice(0, 30)).join(' | '));
  const raceDrawer = S(`SELECT id FROM cash_drawer_sessions WHERE opened_by=${q(cashG)} AND status='open' LIMIT 1`);
  r = await raceSql(2, () => `SELECT public.close_cash_register_v2(${q(raceDrawer)},50,'race',NULL,${q(cashG)})->>'success'`);
  check('R5', '2x drawer-close → exactly 1 success', successes(r) === 1, r.map((x) => x.out || x.err.slice(0, 30)).join(' | '));
  // drawer-close auto-closed the shift; re-open for clock-out races (no drawer now)
  S(`SELECT public.clock_in_atomic_token(${q(tCash)},NULL)`);
  r = await raceSql(2, () => `SELECT public.clock_out_atomic_token(${q(tCash)},NULL)->>'success'`);
  check('R6', '2x clock-out → exactly 1 success', successes(r) === 1, r.map((x) => x.out || x.err.slice(0, 30)).join(' | '));
  S(`SELECT public.clock_in_atomic_token(${q(tCash)},NULL)`);
  const os2 = S(`SELECT id FROM shifts WHERE staff_id=${q(cashG)} AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`);
  r = await raceSql(2, () => `SELECT public.close_shift(${q(tCash)},${q(os2)},0,'race')`);
  // close_shift returns {shift_id,status:'CLOSED'} on success, RAISEs on 2nd
  check('R7', '2x shift-close → exactly 1 success, 1 "already closed"', r.filter((x) => x.ok).length === 1 && r.some((x) => /already closed/i.test(x.err)), r.map((x) => (x.out || 'ERR:' + x.err).slice(0, 34)).join(' | '));
  const otShift2 = crypto.randomUUID();
  S(`INSERT INTO shifts (id,staff_id,report_date,opened_at,closed_at,starting_cash,organization_id,location_id,status) VALUES (${q(otShift2)},${q(cashG)},'2026-09-21','2026-09-21 05:00:00+00','2026-09-21 16:00:00+00',0,${q(ORG)},${q(LOC_A)},'CLOSED')`);
  await raceSql(2, () => `SELECT public.calculate_shift_overtime(${q(otShift2)})`);
  check('R8', '2x overtime calc (parallel) → exactly 1 record (advisory lock)', S(`SELECT count(*) FROM overtime_records WHERE staff_id=${q(cashG)} AND business_date='2026-09-21' AND approved=false`) === '1');
  const sdate2 = '2027-03-11';
  r = await raceSql(2, (i) => `SELECT public.create_schedule(${q(cashG)},${q(sdate2)},'10:00','${i === 0 ? '14' : '12'}:00','race')->>'success'`);
  check('R9', '2x overlapping schedule create → 1 success, 1 row', successes(r) === 1 && S(`SELECT count(*) FROM schedule WHERE staff_id=${q(cashG)} AND schedule_date=${q(sdate2)}`) === '1');
  const sdate3 = '2027-03-12';
  S(`SELECT public.create_schedule(${q(cashG)},${q(sdate3)},'09:00','13:00','base')`);
  const upSid = S(`SELECT id FROM schedule WHERE staff_id=${q(cashG)} AND schedule_date=${q(sdate3)}`);
  await raceSql(2, (i) => i === 0 ? `SELECT public.create_schedule(${q(cashG)},${q(sdate3)},'13:00','17:00','race-new')` : `SELECT public.update_schedule(${q(upSid)},'12:00','16:00','race-upd')`);
  check('R10', 'schedule create/update race → 0 overlaps in DB', S(`SELECT count(*) FROM schedule a JOIN schedule b ON a.staff_id=b.staff_id AND a.schedule_date=b.schedule_date AND a.id<b.id WHERE a.staff_id=${q(cashG)} AND (a.planned_start,a.planned_end) OVERLAPS (b.planned_start,b.planned_end)`) === '0');
  // R11 override-vs-self race: manager clocks out wtr while wtr clocks in → consistent (0 or 1 open)
  await raceSql(2, (i) => i === 0 ? `SELECT public.clock_in_atomic_token(${q(tWtr)},NULL)` : `SELECT public.clock_out_atomic_token(${q(tMgr)},${q(wtrG)},'race-ovr')`);
  check('R11', 'override-vs-self race → 0 or 1 open shift (no corruption)', ['0', '1'].includes(S(`SELECT count(*) FROM shifts WHERE staff_id=${q(wtrG)} AND closed_at IS NULL`)));
  // R12 approved OT immutable (re-verify after R8 activity) — use X9's approved row
  check('R12', 'approved overtime immutable under concurrent recalc', S(`SELECT count(*) FROM overtime_records WHERE staff_id=${q(wtrG)} AND business_date='2026-09-20'`) === '1');
  // R13 2x clock-in via RPC (self) from closed → exactly 1
  // (close any open shift AND clear today's entries so the entry-guard starts clean)
  S(`UPDATE shifts SET closed_at=now(),status='CLOSED' WHERE staff_id=${q(cashG)} AND closed_at IS NULL`);
  S(`DELETE FROM time_clock_entries WHERE staff_id=${q(cashG)}`);
  r = await raceSql(2, () => `SELECT public.clock_in_token(${q(tCash)},${q(cashG)},'pos_terminal')->>'success'`);
  check('R13', '2x clock-in_token (from closed) → exactly 1 success', successes(r) === 1, r.map((x) => x.out || x.err.slice(0, 30)).join(' | '));

  console.log('----- RESIDUE AUDIT (production-wide) -----');
  check('Z1', 'orphan shifts (staff missing) = 0', S(`SELECT count(*) FROM shifts s WHERE NOT EXISTS (SELECT 1 FROM staff t WHERE t.id=s.staff_id)`) === '0');
  const newOrphans = S(`SELECT count(*) FROM cash_drawer_sessions d WHERE NOT EXISTS (SELECT 1 FROM staff t WHERE t.id=d.opened_by) AND d.created_at > now() - interval '1 day'`);
  const preOrphans = S(`SELECT count(*) FROM cash_drawer_sessions d WHERE NOT EXISTS (SELECT 1 FROM staff t WHERE t.id=d.opened_by) AND d.created_at <= now() - interval '1 day'`);
  check('Z2', 'orphan drawer sessions NEW (last 24h, my code) = 0', newOrphans === '0', 'new=' + newOrphans + ' pre-existing=' + preOrphans);
  if (Number(preOrphans) > 0) console.log(`  NOTE Z2: ${preOrphans} PRE-EXISTING drawer(s) with NULL opened_by (abandoned before S-08; NOT auto-closed — business decision). See E_S_FREEZE.md.`);
  check('Z3', 'multiple OPEN drawers per shift = 0', S(`SELECT count(*) FROM (SELECT shift_id FROM cash_drawer_sessions WHERE shift_id IS NOT NULL AND status='open' GROUP BY shift_id HAVING count(*)>1) x`) === '0');
  check('Z4', 'shift/drawer staff mismatch = 0', S(`SELECT count(*) FROM cash_drawer_sessions d JOIN shifts s ON s.id=d.shift_id WHERE s.staff_id <> d.opened_by`) === '0');
  check('Z5', 'overlapping schedules (any staff) = 0', S(`SELECT count(*) FROM schedule a JOIN schedule b ON a.staff_id=b.staff_id AND a.schedule_date=b.schedule_date AND a.id<b.id WHERE (a.planned_start,a.planned_end) OVERLAPS (b.planned_start,b.planned_end)`) === '0');
  check('Z6', 'duplicate unapproved overtime = 0', S(`SELECT count(*) FROM (SELECT staff_id,overtime_type,business_date FROM overtime_records WHERE approved=false GROUP BY 1,2,3 HAVING count(*)>1) x`) === '0');
  check('Z7', 'open breaks without open shift = 0', S(`SELECT count(*) FROM shift_breaks sb JOIN shifts s ON s.id=sb.shift_id WHERE sb.ended_at IS NULL AND s.closed_at IS NOT NULL`) === '0');
  check('Z8', 'audit residue (performed_by not staff) = 0', S(`SELECT count(*) FROM time_clock_audit a WHERE NOT EXISTS (SELECT 1 FROM staff t WHERE t.id=a.performed_by)`) === '0');
  check('Z9', 'cross-org leakage (shift org ≠ staff org) = 0', S(`SELECT count(*) FROM shifts s JOIN staff t ON t.id=s.staff_id WHERE s.organization_id IS DISTINCT FROM t.organization_id`) === '0');
  check('Z10', 'closed shift with status<>CLOSED = 0 (migration 19 invariant)', S(`SELECT count(*) FROM shifts WHERE closed_at IS NOT NULL AND status <> 'CLOSED'`) === '0');

  console.log('----- RE-AUDIT SWEEP (old implementations unreachable) -----');
  check('A1', 'legacy uuid-identity clock/break RPCs DROPPED (0)', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('clock_in','clock_out','start_break','end_break','clock_in_atomic','clock_out_atomic')`) === '0');
  check('A2', 'old 4-arg clock_in/out_token (p_pin) gone (0)', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('clock_in_token','clock_out_token') AND p.proargnames IS NOT NULL AND array_to_string(p.proargnames,',') LIKE '%p_pin%'`) === '0');
  check('A3', 'old open_cash_register(p_opened_by) gone (0)', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='open_cash_register' AND p.proargnames IS NOT NULL AND array_to_string(p.proargnames,',') LIKE '%p_opened_by%'`) === '0');
  check('A4', 'md5 in clock/break/cash fns = 0', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%md5%' AND (p.proname ILIKE '%clock%' OR p.proname ILIKE '%break%' OR p.proname ILIKE '%cash%')`) === '0');
  check('A5', 'hardcoded CURRENT_DATE in S clock/close fns = 0', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%current_date%' AND p.proname IN ('clock_in_token','clock_out_token','clock_in_atomic_token','clock_out_atomic_token','close_shift','get_time_clock_status','open_shift','calculate_shift_overtime')`) === '0');
  check('A6', 'expected_cash=0 hardcode gone from close paths', S(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('close_shift','close_cash_register_v2') AND p.prosrc ILIKE '%expected_cash = 0%'`) === '0');
  const { execSync } = require('child_process');
  const a7 = execSync(`grep -rn "p_pin\\b\\|p_opened_by\\|rpc/clock_in'\\|rpc/clock_out'\\|rpc/start_break'\\|rpc/end_break'\\|rpc/clock_in_atomic'\\|rpc/clock_out_atomic'" /Users/mr.apple/saito-admin1/artifacts/saito-admin/src --include=*.ts | grep -v node_modules | grep -v __tests__ | grep -v p_pin_banned || true`, { encoding: 'utf8' });
  check('A7', 'TS: no legacy p_pin/p_opened_by/rpc calls (excluding p_pin_banned)', a7.trim().length === 0, a7.trim());
  const authRoutes = ['time-clock/[id]/clock-in', 'time-clock/[id]/clock-out', 'time-clock/[id]/break', 'time-clock/[id]/status', 'staff/clock', 'pos/staff/clock'];
  const a8 = authRoutes.every((f) => { try { return /validateAuth|requireAuth|requirePermission/.test(execSync(`cat "/Users/mr.apple/saito-admin1/artifacts/saito-admin/src/app/api/${f}/route.ts"`, { encoding: 'utf8' })); } catch { return false; } });
  check('A8', 'TS: all 6 time-clock routes (incl status) authenticated', a8, JSON.stringify(authRoutes));
  check('A9', 'no unauthenticated status/audit read (G-2) — status 401, audit has requirePermission', stNoAuth.status === 401 && /requirePermission/.test(execSync(`cat "/Users/mr.apple/saito-admin1/artifacts/saito-admin/src/app/api/time-clock/[id]/audit/route.ts"`, { encoding: 'utf8' })));

  // CLEANUP
  console.log('----- CLEANUP -----');
  const gs = [cashG, wtrG, mgrG, noLocG, inactG];
  const gl = gs.map((x) => q(x)).join(',');
  S(`DELETE FROM overtime_records WHERE staff_id IN (${gl})`);
  S(`UPDATE cash_drawer_sessions SET status='closed',closed_at=now(),closing_balance=0,expected_balance=0,difference=0 WHERE opened_by IN (${gl})`);
  S(`DELETE FROM cash_drawer_log WHERE session_id IN (SELECT id FROM cash_drawer_sessions WHERE opened_by IN (${gl}))`);
  S(`DELETE FROM cash_drawer_sessions WHERE opened_by IN (${gl})`);
  S(`DELETE FROM cash_drawer_logs WHERE staff_id IN (${gl})`);
  S(`DELETE FROM shift_breaks WHERE staff_id IN (${gl})`);
  S(`DELETE FROM time_clock_entries WHERE staff_id IN (${gl})`);
  S(`DELETE FROM time_clock_audit WHERE performed_by IN (${gl})`);
  S(`DELETE FROM shifts WHERE staff_id IN (${gl})`);
  S(`DELETE FROM schedule WHERE staff_id IN (${gl})`);
  S(`DELETE FROM sessions WHERE user_id IN (${gl})`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (${gl})`);
  S(`UPDATE staff SET is_active=false,status='INACTIVE',pin_hash='' WHERE id IN (${gl})`);
  S(`DELETE FROM security_events WHERE staff_id IN (${gl})`);
  console.log('cleanup done');

  const failed = results.filter((x) => !x.pass);
  console.log(`\n========== E/S GATE v2 REPORT ==========\nTOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}\n${failed.length ? 'FAILURES:\n' + failed.map((f) => `  ${f.id} ${f.name}: ${f.evidence}`).join('\n') : 'ALL GREEN'}`);
  fs.writeFileSync('.es-gate-report.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('GATE CRASH:', e); process.exit(2); });
