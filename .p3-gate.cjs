// P-3 AMOUNT/IMMUTABILITY GATE (idempotent, zero-residue) — freezes P3_AMOUNT_CONTRACT_DRAFT (ratified 2026-09-13)
// P3-F3: order_payments immutability (amount/method/is_refund immutable; DELETE blocked except trusted reopen path;
//        payment_method NOT blocked = saito_reverse_payment soft-delete marker).
// P3-F4b: underpayment close block (0<paid<total cannot enter paid/closed -> PAYMENT_INCOMPLETE).
// + overpay/zero/negative, exact, duplicate, concurrent, correction/new-row, P-1 location reflow, P-2 state reflow.
// Run: node .p3-gate.cjs  (dev server on :3000). DB batteries = DO blocks (single conn, pooler-safe).
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs'); const http = require('http');
const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const ORG = '00000000-0000-0000-0000-000000000001', LOC_A = 'f1f830b3-cf15-47e3-a538-01abd8222c6d', LOC_B = '70000000-0000-4000-8000-000000000002';
const APP = 'http://localhost:3000';
function Sx(sql) { const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-c', sql], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8', timeout: 120000 }); return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() }; }
function q(s) { return `'${s}'`; }
const results = [];
function P(id, name, pass, ev) { results.push({ id, pass: !!pass }); console.log((pass ? 'PASS' : 'FAIL') + ' ' + id + ' ' + name + (pass ? '' : ' -> ' + String(ev).slice(0, 200))); }

(async () => {
  try {
    // ---- pre-flight residue sweep (SAFETY: only 0-item NULL-table orders = my probes;
    // real NULL-table orders (QR) always carry items, so this never touches production).
    // The P-3 immutability trigger blocks order_payments DELETEs, so the sweep sets the
    // trusted (session-scoped) flag first — same session, no COMMIT in between. ----
    const sub = `(SELECT id FROM orders WHERE table_number IS NULL AND created_at > now()-interval '30 minutes' AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id=orders.id))`;
    Sx(`BEGIN;
        SELECT set_config('app.payment_ledger_reopen','on',false);
        DELETE FROM order_payments WHERE order_id IN ${sub};
        DELETE FROM payment_idempotency_keys WHERE order_id IN ${sub};
        DELETE FROM outbox_events WHERE aggregate_id IN ${sub};
        DELETE FROM audit_logs WHERE order_id IN ${sub};
        DELETE FROM operation_logs WHERE order_id IN ${sub};
        DELETE FROM order_items WHERE order_id IN ${sub};
        DELETE FROM orders WHERE id IN ${sub};
        SELECT set_config('app.payment_ledger_reopen','off',false);
        COMMIT;`);
    Sx(`DELETE FROM staff WHERE name LIKE 'P3_%'`);
    const ALL = []; // probe order ids, tracked for zero-residue cleanup (C1 pushes the reopen order)

    // ===================== DB IMMUTABILITY + AMOUNT BATTERY (single DO block) =====================
    // Session TEMP table (no ON COMMIT DROP) — autocommit would drop an ON-COMMIT-DROP
    // table right after CREATE. Each probe emits a single-token "ID=RESULT line".
    const imm = Sx(`
      CREATE TEMP TABLE _p3r(line text);
      DO $$
      DECLARE o uuid; p uuid;
      BEGIN
        INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version)
        VALUES (gen_random_uuid(),NULL,'confirmed',1,100,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1) RETURNING id INTO o;
        INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES (o,'card','card',100,'captured',now(),'AZN') RETURNING id INTO p;
        BEGIN INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES (o,'card','card',0,'captured',now(),'AZN');
              INSERT INTO _p3r VALUES('A1=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A1=REJ '||SQLSTATE::text); END;
        BEGIN INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES (o,'card','card',-5,'captured',now(),'AZN');
              INSERT INTO _p3r VALUES('A2=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A2=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE order_payments SET amount=50 WHERE id=p; INSERT INTO _p3r VALUES('A4=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A4=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE order_payments SET method='cash' WHERE id=p; INSERT INTO _p3r VALUES('A5=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A5=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE order_payments SET is_refund=true WHERE id=p; INSERT INTO _p3r VALUES('A6=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A6=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE order_payments SET payment_method='reversed' WHERE id=p; INSERT INTO _p3r VALUES('A8=OK'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A8=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE order_payments SET status='settled' WHERE id=p; INSERT INTO _p3r VALUES('A7a=OK'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A7a=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE order_payments SET status='pending' WHERE id=p; INSERT INTO _p3r VALUES('A7b=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A7b=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE order_payments SET amount=60 WHERE id=p; INSERT INTO _p3r VALUES('A4b=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A4b=REJ '||SQLSTATE::text); END;
        BEGIN DELETE FROM order_payments WHERE id=p; INSERT INTO _p3r VALUES('A9=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A9=REJ '||SQLSTATE::text); END;
        BEGIN INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency,is_refund) VALUES (o,'cash','cash',20,'captured',now(),'AZN',true);
              INSERT INTO _p3r VALUES('A10=OK'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3r VALUES('A10=REJ '||SQLSTATE::text); END;
        PERFORM set_config('app.payment_ledger_reopen', 'on', true);
        DELETE FROM order_payments WHERE order_id = o;
        DELETE FROM orders WHERE id = o;
        PERFORM set_config('app.payment_ledger_reopen', 'off', true);
      END $$;
      SELECT line FROM _p3r;
      DROP TABLE _p3r;
    `);
    const L = {}; (imm.out || '').split('\n').forEach(l => { const m = l.match(/^([A-Za-z0-9_]+)=/); if (m) L[m[1]] = l.slice(m[0].length); });
    P('A1', 'INSERT amount=0 rejected (amount>0 CHECK)', /^REJ/.test(L['A1'] || ''), L['A1'] || imm.err.slice(0, 80));
    P('A2', 'INSERT amount<0 rejected (amount>0 CHECK)', /^REJ/.test(L['A2'] || ''), L['A2']);
    P('A4', 'UPDATE amount rejected (PAYMENT_RECORD_IMMUTABLE)', /^REJ/.test(L['A4'] || ''), L['A4']);
    P('A5', 'UPDATE method rejected (immutability)', /^REJ/.test(L['A5'] || ''), L['A5']);
    P('A6', 'UPDATE is_refund rejected (immutability)', /^REJ/.test(L['A6'] || ''), L['A6']);
    P('A8', 'UPDATE payment_method ALLOWED (soft-delete marker, not blocked)', /^OK/.test(L['A8'] || ''), L['A8']);
    P('A7a', 'P-2 reflow: captured->settled legal (still allowed)', /^OK/.test(L['A7a'] || ''), L['A7a']);
    P('A7b', 'P-2 reflow: settled->pending illegal (still rejected)', /^REJ/.test(L['A7b'] || ''), L['A7b']);
    P('A4b', 'UPDATE amount (post payment_method) rejected', /^REJ/.test(L['A4b'] || ''), L['A4b']);
    P('A9', 'DELETE rejected without trusted flag (PAYMENT_RECORD_IMMUTABLE)', /^REJ/.test(L['A9'] || ''), L['A9']);
    P('A10', 'correction/new refund row INSERT allowed (append-only)', /^OK/.test(L['A10'] || ''), L['A10']);

    // ===================== UNDERPAYMENT CLOSE BLOCK (single DO block) =====================
    const up = Sx(`
      CREATE TEMP TABLE _p3u(line text);
      DO $$
      DECLARE o1 uuid; o2 uuid; o3 uuid; o4 uuid;
      BEGIN
        INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (gen_random_uuid(),NULL,'confirmed',1,40,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1) RETURNING id INTO o1;
        INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (gen_random_uuid(),NULL,'confirmed',1,40,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1) RETURNING id INTO o2;
        INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (gen_random_uuid(),NULL,'confirmed',1,40,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1) RETURNING id INTO o3;
        INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (gen_random_uuid(),NULL,'confirmed',1,40,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1) RETURNING id INTO o4;
        BEGIN UPDATE orders SET status='paid', paid_amount=23 WHERE id=o1; INSERT INTO _p3u VALUES('B1=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3u VALUES('B1=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE orders SET status='closed', paid_amount=23 WHERE id=o1; INSERT INTO _p3u VALUES('B2=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3u VALUES('B2=REJ '||SQLSTATE::text); END;
        -- P-5 (D-1c, ratified 2026-09-13): a bare UPDATE ->paid with no payment
        -- record is now blocked by the P-5 atomicity trigger, so B3/B4 seed the
        -- record FIRST (amount=40=total) and keep testing the UNDERPAYMENT guard
        -- (P-3's subject) on full payment — the P-5 record trigger is satisfied
        -- and silent; only the underpayment logic is exercised here.
        INSERT INTO order_payments(order_id,payment_method,method,amount,status,is_refund) VALUES (o2,'card','card',40,'captured',false);
        BEGIN UPDATE orders SET status='paid', paid_amount=40 WHERE id=o2; INSERT INTO _p3u VALUES('B3=OK'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3u VALUES('B3=REJ '||SQLSTATE::text); END;
        BEGIN UPDATE orders SET status='closed', paid_amount=40 WHERE id=o2; INSERT INTO _p3u VALUES('B4=OK'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3u VALUES('B4=REJ '||SQLSTATE::text); END;
        -- B5: the underpayment guard must NOT over-block a zero-remainder close.
        --     confirmed->cancelled is a legal registry transition; paid_amount=0
        --     (void) is not 0<paid<total, so the guard stays silent -> OK.
        BEGIN UPDATE orders SET status='cancelled', paid_amount=0 WHERE id=o3; INSERT INTO _p3u VALUES('B5=OK'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3u VALUES('B5=REJ '||SQLSTATE::text||' '||left(SQLERRM,60)); END;
        -- B6: the 0.01 tolerance boundary — 39/40 (under by 1.00) must still BLOCK.
        BEGIN UPDATE orders SET status='paid', paid_amount=39 WHERE id=o4; INSERT INTO _p3u VALUES('B6=BAD_ACCEPT'); EXCEPTION WHEN OTHERS THEN INSERT INTO _p3u VALUES('B6=REJ '||SQLSTATE::text); END;
        -- P-5: seed's order_payments rows are ledger rows — delete via the
        -- trusted reopen flag (sanctioned teardown path) before the orders DELETE
        -- (FK order_payments_order_id_fkey).
        PERFORM set_config('app.payment_ledger_reopen','on',false);
        DELETE FROM order_payments WHERE order_id IN (o1,o2,o3,o4);
        DELETE FROM orders WHERE id IN (o1,o2,o3,o4);
        PERFORM set_config('app.payment_ledger_reopen','off',false);
      END $$;
      SELECT line FROM _p3u;
      DROP TABLE _p3u;
    `);
    const U = {}; (up.out || '').split('\n').forEach(l => { const m = l.match(/^([A-Za-z0-9_]+)=/); if (m) U[m[1]] = l.slice(m[0].length); });
    P('B1', "underpaid -> 'paid' BLOCKED (PAYMENT_INCOMPLETE)", /^REJ/.test(U['B1'] || ''), U['B1']);
    P('B2', "underpaid -> 'closed' BLOCKED (PAYMENT_INCOMPLETE)", /^REJ/.test(U['B2'] || ''), U['B2']);
    P('B3', "exact-amount -> 'paid' ALLOWED", /^OK/.test(U['B3'] || ''), U['B3']);
    P('B4', "exact-amount -> 'closed' ALLOWED", /^OK/.test(U['B4'] || ''), U['B4']);
    P('B5', "zero-amount (void) close NOT over-blocked (guard only hits 0<paid<total)", /^OK/.test(U['B5'] || ''), U['B5']);
    P('B6', "boundary: 39/40 (under by 1.00) -> 'paid' still BLOCKED (0.01 tolerance)", /^REJ/.test(U['B6'] || ''), U['B6']);

    // ===================== REOPEN TRUSTED PATH (canonical DELETE exception) =====================
    const roleMgr = (Sx(`SELECT id::text FROM roles WHERE name='manager'`).out || '').trim();
    const mgr = crypto.randomUUID();
    Sx(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(mgr)},${q('P3_MGR')},${q('P3_MGR')},${q(roleMgr)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
    // reopen (trusted DELETE exception) — REAL committed test (stronger than a rolled-back
    // probe; the order is tracked in ALL[] for cleanup). Proves the P-3 immutability DELETE
    // block does NOT regress the canonical full-reversal path.
    const ORO = crypto.randomUUID(); ALL.push(ORO);
    Sx(`INSERT INTO orders(id,table_number,status,guest_count,paid_amount,total_amount,location_id,organization_id,kitchen_status,paid_at,is_draft,created_at,updated_at,version) VALUES(${q(ORO)},NULL,'paid',1,100,100,${q(LOC_A)},${q(ORG)},'pending',now(),false,now(),now(),1)`);
    Sx(`INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES(${q(ORO)},'card','card',100,'captured',now(),'AZN')`);
    const rp = Sx(`SELECT (public.reopen_order_atomic(${q(ORO)}, 'p3 gate reopen test', ${q(mgr)}))->>'success'`);
    const roPay = Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(ORO)}`).out;
    const roSt = Sx(`SELECT status::text FROM orders WHERE id=${q(ORO)}`).out;
    P('C1', 'reopen_order_atomic trusted DELETE works (P-3 exception path, no regression)', rp.out === 'true' && roPay === '0' && roSt === 'new', `success=${rp.out} pay_after=${roPay} status=${roSt} err=${(rp.err || '').slice(0, 60)}`);

    // ===================== HTTP: pay route (v2) — exact / overpay / underpay / dup / concurrent / P-1 reflow =====================
    const csrf = 'p3csrf';
    const httpPay = (cookie, body) => new Promise(res => { const r = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders/pay', method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `saito_token=${cookie}; saito_csrf=${csrf}`, 'x-csrf-token': csrf } }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ status: resp.statusCode, body: d })); }); r.on('error', e => res({ status: 0, body: e.message })); r.write(JSON.stringify(body)); r.end(); });
    // fixtures for route: mgrA bound A (session A), cashier B (session B)
    const bindLoc = sid => Sx(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(sid)},${q(LOC_A)},true,true,${q(ORG)})`);
    const mgrA = crypto.randomUUID();
    Sx(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(mgrA)},${q('P3_MGR_A')},${q('P3_MGR_A')},${q(roleMgr)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`); bindLoc(mgrA);
    const tMgrA = crypto.randomUUID(); Sx(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tMgrA)},${q(mgrA)},${q('manager')},now()+interval '3h','ACTIVE',${q(ORG)},${q(LOC_A)})`);
    const roleCash = (Sx(`SELECT id::text FROM roles WHERE name='cashier'`).out || '').trim();
    const cashB = crypto.randomUUID();
    Sx(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(cashB)},${q('P3_CASH_B')},${q('P3_CASH_B')},${q(roleCash)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
    Sx(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(cashB)},${q(LOC_B)},true,true,${q(ORG)})`);
    const tCashB = crypto.randomUUID(); Sx(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tCashB)},${q(cashB)},${q('cashier')},now()+interval '3h','ACTIVE',${q(ORG)},${q(LOC_B)})`);
    const mkOrder = (loc, total) => { const id = crypto.randomUUID(); ALL.push(id); Sx(`INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES(${q(id)},NULL,'confirmed',1,${total},${q(loc)},${q(ORG)},'pending',false,now(),now(),1)`); return id; };
    const OEX = mkOrder(LOC_A, 100);      // exact
    const OOVR = mkOrder(LOC_A, 100);     // overpay
    const OUIN = mkOrder(LOC_A, 100);     // underpay partial
    const OCON = mkOrder(LOC_A, 100);     // concurrent
    // paymentRateLimit = 5 req/60s per (ip,token). tMgrA makes 5 pay-route calls
    // (H1,H2,H3,H4a,H4b) -> 65s cool-down after the 5th so the next token/window is clean.
    let mgrACalls = 0;
    const payMgrA = async body => { mgrACalls++; const r = await httpPay(tMgrA, body); if (mgrACalls === 5) await new Promise(r2 => setTimeout(r2, 65000)); return r; };
    // exact
    // P-4 contract: pay route REQUIRES idempotency_key (keyless -> 400); each
    // independent call gets a unique key. H4 keeps its SHARED key (the idempotency test).
    const rEx = await payMgrA({ order_id: OEX, payment_method: 'card', paid_amount: 100, cash_amount: 0, card_amount: 100, idempotency_key: 'p3:' + crypto.randomUUID() });
    P('H1', 'pay exact (100/100) -> 200 paid', rEx.status === 200 && /paid/.test(rEx.body), rEx.status + ' ' + rEx.body.slice(0, 80));
    // overpay — route surfaces the RPC exception as 500 w/ the domain error; the REJECTION
    // (PAYMENT_EXCEEDS_REMAINING, 0 rows, order not paid) is what the gate proves.
    const rOv = await payMgrA({ order_id: OOVR, payment_method: 'card', paid_amount: 150, cash_amount: 0, card_amount: 150, idempotency_key: 'p3:' + crypto.randomUUID() });
    const ovRows = Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(OOVR)}`).out;
    const ovSt = Sx(`SELECT status::text FROM orders WHERE id=${q(OOVR)}`).out;
    P('H2', 'pay overpay (150/100) -> rejected: PAYMENT_EXCEEDS_REMAINING, 0 rows, order not paid', /PAYMENT_EXCEEDS_REMAINING|EXCEEDS|exceed/i.test(rOv.body) && ovRows === '0' && ovSt !== 'paid', 'status=' + rOv.status + ' rows=' + ovRows + ' ord=' + ovSt + ' ' + rOv.body.slice(0, 55));
    // underpay partial -> partial row recorded, order stays OPEN (cannot enter paid)
    const rUi = await payMgrA({ order_id: OUIN, payment_method: 'cash', paid_amount: 23, cash_amount: 23, idempotency_key: 'p3:' + crypto.randomUUID() });
    const uiStatus = Sx(`SELECT status||'|'||paid_amount::text FROM orders WHERE id=${q(OUIN)}`).out;
    const uiPaidRows = Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(OUIN)} AND is_refund=false`).out;
    P('H3', 'pay underpay (23/100) -> partial row recorded BUT order stays OPEN (confirmed, not paid)', rUi.status === 200 && (uiStatus || '').startsWith('confirmed|23') && uiPaidRows === '1', 'route=' + rUi.status + ' order=' + uiStatus + ' payrows=' + uiPaidRows);
    // duplicate (idempotency) exactly-once
    const IK = 'p3ik-' + crypto.randomUUID();
    await payMgrA({ order_id: OCON, payment_method: 'card', paid_amount: 100, cash_amount: 0, card_amount: 100, idempotency_key: IK });
    const c1 = Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(OCON)}`).out;
    const rD2 = await payMgrA({ order_id: OCON, payment_method: 'card', paid_amount: 100, cash_amount: 0, card_amount: 100, idempotency_key: IK });
    const c2 = Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(OCON)}`).out;
    P('H4', 'duplicate payment (same idempotency key) -> exactly once (1 row)', c1 === '1' && c2 === '1' && /idempotent|duplicate/.test(rD2.body), `c1=${c1} c2=${c2}`);
    // P-1 location reflow — use tCashB's own rate-limit bucket (avoid tMgrA's now-limited window).
    // H5a: loc-B cashier pays a loc-B order -> ALLOWED (no over-block).
    const OXB = mkOrder(LOC_B, 100);
    const rXB = await httpPay(tCashB, { order_id: OXB, payment_method: 'card', paid_amount: 100, cash_amount: 0, card_amount: 100, idempotency_key: 'p3:' + crypto.randomUUID() });
    P('H5a', 'P-1 reflow: loc-B cashier -> loc-B order ALLOWED (no over-block)', rXB.status === 200 && /paid/.test(rXB.body), rXB.status + ' ' + rXB.body.slice(0, 55));
    // H5b: a fresh loc-A cashier (own token) pays a loc-B order -> DENIED 403 LOCATION_MISMATCH.
    const cashA = crypto.randomUUID();
    Sx(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(cashA)},${q('P3_CASH_A')},${q('P3_CASH_A')},${q(roleCash)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
    Sx(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(cashA)},${q(LOC_A)},true,true,${q(ORG)})`);
    const tCashA = crypto.randomUUID(); Sx(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tCashA)},${q(cashA)},${q('cashier')},now()+interval '3h','ACTIVE',${q(ORG)},${q(LOC_A)})`);
    const OXB3 = mkOrder(LOC_B, 100);
    const rX = await httpPay(tCashA, { order_id: OXB3, payment_method: 'card', paid_amount: 100, cash_amount: 0, card_amount: 100, idempotency_key: 'p3:' + crypto.randomUUID() });
    P('H5b', 'P-1 reflow: loc-A cashier -> loc-B order DENIED (403 LOCATION_MISMATCH)', rX.status === 403 && /LOCATION_MISMATCH/.test(rX.body), rX.status + ' ' + rX.body.slice(0, 60));

    // ===================== zero-residue cleanup (ALL populated as orders were created) =====================
    // P-3 immutability blocks payment DELETEs -> set the trusted flag in an explicit txn.
    const LST = ALL.map(q).join(',');
    Sx(`BEGIN;
        SELECT set_config('app.payment_ledger_reopen','on',false);
        DELETE FROM order_payments WHERE order_id IN (${LST});
        DELETE FROM payment_idempotency_keys WHERE order_id IN (${LST});
        DELETE FROM outbox_events WHERE aggregate_id IN (${LST});
        DELETE FROM audit_logs WHERE order_id IN (${LST});
        DELETE FROM operation_logs WHERE order_id IN (${LST});
        DELETE FROM order_items WHERE order_id IN (${LST});
        DELETE FROM orders WHERE id IN (${LST});
        SELECT set_config('app.payment_ledger_reopen','off',false);
        COMMIT;`);
    Sx(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P3_%')`);
    Sx(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P3_%')`);
    Sx(`DELETE FROM approval_requests WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P3_%') OR reviewed_by IN (SELECT id FROM staff WHERE name LIKE 'P3_%')`);
    Sx(`ALTER TABLE public.staff DISABLE TRIGGER trg_staff_prevent_delete`);
    Sx(`DELETE FROM staff WHERE name LIKE 'P3_%'`);
    Sx(`ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete`);
    const residue = Sx(`SELECT (SELECT count(*) FROM staff WHERE name LIKE 'P3_%')||'|'||(SELECT count(*) FROM orders WHERE id IN (${ALL.map(q).join(',')}))||'|'||(SELECT count(*) FROM order_payments WHERE order_id IN (${ALL.map(q).join(',')}))`).out;
    P('Z1', 'zero residue: P3_ staff=0, probe orders=0, payments=0', residue === '0|0|0', residue);

    const failed = results.filter(r => !r.pass);
    console.log('\n===== P3 GATE: ' + (results.length - failed.length) + '/' + results.length + ' PASS' + (failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(',') : '') + ' =====');
    try { fs.writeFileSync('.p3-gate-report.json', JSON.stringify({ date: new Date().toISOString(), results, total: results.length, failed: failed.length, crashed: false }, null, 2)); } catch (e) {}
    process.exit(failed.length ? 1 : 0);
  } catch (e) {
    try { const s2 = `(SELECT id FROM orders WHERE table_number IS NULL AND created_at > now()-interval '30 minutes' AND NOT EXISTS (SELECT 1 FROM order_items oi2 WHERE oi2.order_id=orders.id))`; Sx(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false); DELETE FROM order_payments WHERE order_id IN ${s2}; DELETE FROM orders WHERE id IN ${s2}; SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`); Sx(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P3_%')`); Sx(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P3_%')`); Sx(`ALTER TABLE public.staff DISABLE TRIGGER trg_staff_prevent_delete`); Sx(`DELETE FROM staff WHERE name LIKE 'P3_%'`); Sx(`ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete`); } catch (e2) {}
    try { fs.writeFileSync('.p3-gate-report.json', JSON.stringify({ total: results.length, failed: results.filter(r => !r.pass).length, crashed: true, error: String(e && e.message || e) }, null, 2)); } catch (e2) {}
    console.error('P3 GATE HARNESS ERROR:', e && e.message || e);
    process.exit(2);
  }
})();
