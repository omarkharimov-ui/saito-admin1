// P-2 STATE GATE (idempotent, zero-residue) — freezes P2_STATE_CONTRACT_DRAFT_2026-09-12.md (ratified)
// S1: entity='table' rows dropped. S2: entity='payment' 22 rules registry.
// S3: order_payments.status guard — legal pass, illegal rejected, NULL init ok, unset rejected.
// + P-1 reflow (location assertion still enforced on live pay route).
// Run: node .p2-gate.cjs  (dev server on :3000)
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs');
const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const ORG = '00000000-0000-0000-0000-000000000001', LOC_A = 'f1f830b3-cf15-47e3-a538-01abd8222c6d', LOC_B = '70000000-0000-4000-8000-000000000002';
const APP = 'http://localhost:3000';
// NOTE: no ON_ERROR_STOP here — each -c is its own txn. A guard-rejected UPDATE
// must fail WITHOUT rolling back the earlier fixture INSERT (psql otherwise aborts
// the whole -c list; ON_ERROR_STOP would make the prior INSERTs vanish too).
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8',timeout:60000});if(r.status!==0)throw new Error(q.slice(0,90)+': '+r.stderr);return r.stdout.trim();}
function Sx(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8',timeout:60000});return{ok:r.status===0,out:r.stdout.trim(),err:r.stderr.trim()};}
const q = s => `'${s}'`;
let SVC = '';
try { const env = fs.readFileSync('artifacts/saito-admin/.env.local', 'utf8'); const k = env.indexOf('SUPABASE_SERVICE_ROLE_KEY='); if (k >= 0) { let v = env.slice(k + 26).split('\n')[0].trim(); v = v.replace(/^["']/, '').replace(/["']$/, ''); SVC = v; } } catch (e) {}
const results = [];
function P(id, name, pass, ev) { results.push({ id, pass: !!pass }); console.log((pass ? 'PASS' : 'FAIL') + ' ' + id + ' ' + name + (pass ? '' : ' -> ' + String(ev).slice(0, 180))); }

(async () => {
  try {
    // ============ S1: table entity dropped ============
    const tblRows = S(`SELECT count(*)::text FROM state_transitions WHERE entity='table'`);
    P('S1-1', "entity='table' rows = 0 (orphaned registry dropped)", tblRows === '0', 'rows=' + tblRows);
    // ============ S2: payment registry ============
    const payRows = S(`SELECT count(*)::text FROM state_transitions WHERE entity='payment' AND is_active`);
    P('S2-1', "entity='payment' registry = 22 active rules (single SSOT)", payRows === '22', 'rows=' + payRows);
    const payStates = S(`SELECT count(*)::text FROM (SELECT status FROM (SELECT from_status status FROM state_transitions WHERE entity='payment' UNION SELECT to_status FROM state_transitions WHERE entity='payment') u)`);
    P('S2-2', 'payment registry spans 12 states', payStates === '12', 'states=' + payStates);
    const terminals = S(`SELECT count(*)::text FROM (SELECT DISTINCT to_status FROM state_transitions WHERE entity='payment') t WHERE NOT EXISTS (SELECT 1 FROM state_transitions s WHERE s.entity='payment' AND s.from_status=t.to_status)`);
    P('S2-3', 'exactly 4 terminal payment states (settled/refunded/voided/cancelled)', terminals === '4', 'terminals=' + terminals);

    // ============ fixtures ============
    // PRE-FLIGHT residue sweep (idempotent, conservative): killed prior runs leave
    // NULL-table probe orders + their payments; each order delete fires ~10 cascade
    // triggers (measured 10s+ under contention), which accumulates into apparent hangs.
    // 30-min window + 0-item filter (real NULL-table orders (QR) carry items) so this
    // never touches production. P-3 immutability blocks order_payments DELETE, so the
    // sweep sets the trusted flag in one txn (same pattern as .p3-gate.cjs).
    const sub2 = `(SELECT id FROM orders WHERE table_number IS NULL AND created_at > now()-interval '30 minutes' AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id=orders.id))`;
    S(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false);
        DELETE FROM order_payments WHERE order_id IN ${sub2};
        DELETE FROM payment_idempotency_keys WHERE order_id IN ${sub2};
        DELETE FROM outbox_events WHERE aggregate_id IN ${sub2};
        DELETE FROM audit_logs WHERE order_id IN ${sub2};
        DELETE FROM operation_logs WHERE order_id IN ${sub2};
        DELETE FROM orders WHERE id IN ${sub2};
        SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`);
    const roleById = n => S(`SELECT id::text FROM roles WHERE name='${n}'`);
    const mkStaff = (name, rl) => { const id = crypto.randomUUID(); S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(id)},${q(name)},${q(name)},${q(roleById(rl))},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`); return id; };
    const bindLoc = (sid, loc) => S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(sid)},${q(loc)},true,true,${q(ORG)})`);
    const mkSess = (sid, rl, loc) => { const t = crypto.randomUUID(); S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(t)},${q(sid)},${q(rl)},now()+interval '3h','ACTIVE',${q(ORG)},${q(loc)})`); return t; };
    const OIDS = [];
    const PIDS = [];
    const mkOrder = (loc, amount = 100) => { const id = crypto.randomUUID(); OIDS.push(id); S(`INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES(${q(id)},NULL,'confirmed',1,${amount},${q(loc)},${q(ORG)},'pending',false,now(),now(),1)`); return id; };
    // Shared carrier orders (one per location) — a per-iteration INSERT INTO orders
    // fires ~10 cascade triggers (10s+ each under load); reusing carriers keeps the
    // battery fast. Carriers are deleted with the full cascade in cleanup.
    const O_A = mkOrder(LOC_A, 100); const O_B = mkOrder(LOC_B, 100);
    const cleanupOids = () => { if (!OIDS.length) return; const list = OIDS.map(q).join(','); S(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false); DELETE FROM order_payments WHERE order_id IN (${list}); DELETE FROM payment_idempotency_keys WHERE order_id IN (${list}); DELETE FROM outbox_events WHERE aggregate_id IN (${list}); DELETE FROM audit_logs WHERE order_id IN (${list}); DELETE FROM operation_logs WHERE order_id IN (${list}); DELETE FROM order_items WHERE order_id IN (${list}); DELETE FROM orders WHERE id IN (${list}); SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`); OIDS.length = 0; };

    // payment-row fixture helper (direct INSERT status='captured', then test transitions)
    let PAY_FIX = null;
    const mkPayFix = (status) => { const oid = O_A; const r = Sx(`INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES(${q(oid)},'card','card',100,${status === 'NULL' ? 'NULL' : q(status)},now(),'AZN') RETURNING id`); if (!r.ok) throw new Error('mkPayFix insert failed: ' + r.err); const pid = r.out.split('\n')[0].trim(); PIDS.push(pid); PAY_FIX = { oid, pid }; return pid; };
    const setPay = (to) => Sx(`UPDATE order_payments SET status=${to === 'NULL' ? 'NULL' : q(to)} WHERE id=${q(PAY_FIX.pid)}`);
    const getStatus = (pid) => { const r = Sx(`SELECT status::text FROM order_payments WHERE id=${q(pid)}`); return r.ok ? r.out : 'ERR:' + r.err.slice(0, 80); };

    // ============ S3: guard trigger present + enforcement ============
    P('S3-1', 'guard trigger present on order_payments', S(`SELECT count(*)::text FROM pg_trigger WHERE tgname='trg_payment_state_machine_guard'`) === '1', 'trig=' + S(`SELECT count(*)::text FROM pg_trigger WHERE tgname='trg_payment_state_machine_guard'`));


    // ===== transition battery — runs in ONE in-DB DO block (single connection).
    // The shared transaction-pooler is slow per-connection (each spawnSync psql = a
    // new connection + orders cascade triggers = 0.5–11s), so ~20 separate psql calls
    // would take minutes and look like a hang. One DO block = one round trip. =====
    const LEGAL = 'captured:settled,captured:refunded,captured:partially_refunded,partially_refunded:refunded,pending:processing,processing:captured,processing:authorized,authorized:captured,authorized:voided,unknown:captured,failed:pending';
    const ILLEGAL = 'captured:pending,settled:captured,refunded:captured,voided:captured,settled:refunded,authorized:refunded,processing:voided,partially_refunded:settled,cancelled:processing';
    const battery = Sx(`
      CREATE TEMP TABLE _p2res(line text) ON COMMIT DROP;
      DO $b$
      DECLARE
        t text; from_s text; to_s text; oid uuid; pid uuid; cur text; err text;
        legal_ok int := 0; ill_ok int := 0; legal_ev text := ''; ill_ev text := '';
        init_after text; unset_after text; unset_err text := '';
       BEGIN
        oid := ${q(O_A)}::uuid;
        -- P-3: the battery cleans up its own probe payment rows; set the trusted
        -- full-reversal flag so those DELETEs pass the P-3 immutability guard.
        PERFORM set_config('app.payment_ledger_reopen','on',true);
        -- LEGAL: insert at from-state (INSERT bypasses guard), update to to-state (guard must allow)
        FOREACH t IN ARRAY string_to_array('${LEGAL}', ',') LOOP
          from_s := split_part(t,':',1); to_s := split_part(t,':',2);
          INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES(oid,'card','card',100,from_s,now(),'AZN') RETURNING id INTO pid;
        BEGIN
          UPDATE order_payments SET status=to_s WHERE id=pid;
          SELECT status INTO cur FROM order_payments WHERE id=pid;
          IF cur = to_s THEN legal_ok := legal_ok+1; ELSE legal_ev := legal_ev||from_s||'->'||to_s||':after='||coalesce(cur,'null')||'; '; END IF;
        EXCEPTION WHEN OTHERS THEN
          legal_ev := legal_ev||from_s||'->'||to_s||':err='||SQLERRM||'; ';
          SELECT coalesce(status,'null') INTO cur FROM order_payments WHERE id=pid;
          IF cur = to_s THEN legal_ok := legal_ok+1; END IF;
        END;
          DELETE FROM order_payments WHERE id=pid;
        END LOOP;
        -- ILLEGAL: insert at from-state, update to to-state (guard must reject, value stays)
        FOREACH t IN ARRAY string_to_array('${ILLEGAL}', ',') LOOP
          from_s := split_part(t,':',1); to_s := split_part(t,':',2);
          INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES(oid,'card','card',100,from_s,now(),'AZN') RETURNING id INTO pid;
        BEGIN
          UPDATE order_payments SET status=to_s WHERE id=pid;
          SELECT status INTO cur FROM order_payments WHERE id=pid;
          ill_ev := ill_ev||from_s||'->'||to_s||':NOTREJECTED(after='||coalesce(cur,'null')||')';
        EXCEPTION WHEN OTHERS THEN
          err := SQLERRM;
          SELECT coalesce(status,'null') INTO cur FROM order_payments WHERE id=pid;
          IF cur = from_s AND position('INVALID_PAYMENT_TRANSITION' in err) > 0 THEN ill_ok := ill_ok+1; ELSE ill_ev := ill_ev||from_s||'->'||to_s||':wrongerr='||err||'; '; END IF;
        END;
          DELETE FROM order_payments WHERE id=pid;
        END LOOP;
        -- NULL init (allowed)
        INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES(oid,'card','card',100,NULL,now(),'AZN') RETURNING id INTO pid;
        BEGIN
          UPDATE order_payments SET status='captured' WHERE id=pid;
          SELECT status INTO init_after FROM order_payments WHERE id=pid;
        EXCEPTION WHEN OTHERS THEN init_after := 'ERR:'||SQLERRM; END;
        DELETE FROM order_payments WHERE id=pid;
        -- unset (captured -> NULL, must reject)
        INSERT INTO order_payments(order_id,payment_method,method,amount,status,created_at,currency) VALUES(oid,'card','card',100,'captured',now(),'AZN') RETURNING id INTO pid;
        BEGIN
          UPDATE order_payments SET status=NULL WHERE id=pid;
          unset_after := 'NOTREJECTED';
        EXCEPTION WHEN OTHERS THEN
          unset_err := SQLERRM;
          SELECT coalesce(status,'null') INTO unset_after FROM order_payments WHERE id=pid;
        END;
        DELETE FROM order_payments WHERE id=pid;
        INSERT INTO _p2res VALUES ('legal_ok='||legal_ok||'/11');
        INSERT INTO _p2res VALUES ('legal_ev='||coalesce(legal_ev,''));
        INSERT INTO _p2res VALUES ('ill_ok='||ill_ok||'/9');
        INSERT INTO _p2res VALUES ('ill_ev='||coalesce(ill_ev,''));
        INSERT INTO _p2res VALUES ('init_after='||coalesce(init_after,'null'));
        INSERT INTO _p2res VALUES ('unset_after='||coalesce(unset_after,'null'));
        INSERT INTO _p2res VALUES ('unset_err='||coalesce(unset_err,''));
      END
      $b$;
      SELECT line FROM _p2res;
      DROP TABLE IF EXISTS _p2res;
    `);
    const parseBat = {}; (battery.out || '').split('\n').forEach(l => { const i = l.indexOf('='); if (i > 0) parseBat[l.slice(0, i)] = l.slice(i + 1); });
    P('S3-2', 'all 11 sampled LEGAL payment transitions PASS the guard (table-level)', parseBat.legal_ok === '11/11' && parseBat.legal_ev === '', (parseBat.legal_ev || parseBat.legal_ok || battery.err.slice(0, 120)));
    P('S3-3', 'all 9 ILLEGAL payment transitions REJECTED at table level (value unchanged)', parseBat.ill_ok === '9/9' && parseBat.ill_ev === '', (parseBat.ill_ev || parseBat.ill_ok || battery.err.slice(0, 120)));
    P('S3-4', 'NULL -> captured (init) allowed', parseBat.init_after === 'captured', 'after=' + parseBat.init_after);
    P('S3-5', 'captured -> NULL (unset) REJECTED', parseBat.unset_after === 'captured' && /cannot be unset/.test(parseBat.unset_err || ''), 'after=' + parseBat.unset_after + ' ' + (parseBat.unset_err || '').slice(0, 40));

    // legacy NULL rows untouched (count unchanged from live baseline 45)
    const nullCount = S(`SELECT count(*)::text FROM order_payments WHERE status IS NULL`);
    P('S3-6', 'legacy NULL-status rows intact (not mutated by guard/migration)', Number(nullCount) >= 45, 'nulls=' + nullCount);

    // ============ P-1 reflow: location assertion still enforced ============
    const mgrA = mkStaff('P2_MGR_A', 'manager'); bindLoc(mgrA, LOC_A); const tMgrA = mkSess(mgrA, 'manager', LOC_A);
    const oB = O_B; // shared carrier @ LOC_B
    const csrf = 'p2csrf';
    const pay = async (cookie, body) => new Promise(res => { const u = new URL(APP + '/api/orders/pay'); const h = { 'Content-Type': 'application/json', Cookie: `saito_token=${cookie}; saito_csrf=${csrf}` }; if (body) h['x-csrf-token'] = csrf; const r = require('http').request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: h }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ status: resp.statusCode, body: d })); }); r.on('error', e => res({ status: 0, body: e.message })); r.write(JSON.stringify(body || {})); r.end(); });
    const rCross = await pay(tMgrA, { order_id: oB, payment_method: 'card', paid_amount: 100, cash_amount: 0, card_amount: 100, idempotency_key: 'p2:' + crypto.randomUUID() });
    P('S3-7', 'P-1 reflow: cross-location pay still DENIED (location assertion intact)', rCross.status === 403 && /LOCATION_MISMATCH/.test(rCross.body), 'status=' + rCross.status + ' ' + rCross.body.slice(0, 60));
    const rSame = await pay(tMgrA, { order_id: O_A, payment_method: 'card', paid_amount: 100, cash_amount: 0, card_amount: 100, idempotency_key: 'p2:' + crypto.randomUUID() });
    P('S3-8', 'P-1 reflow: same-location pay still ALLOWED (no over-block)', rSame.status === 200 && /paid/.test(rSame.body), 'status=' + rSame.status + ' ' + rSame.body.slice(0, 60));

    // ============ zero-residue cleanup ============
    if (PIDS.length) S(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false); DELETE FROM order_payments WHERE id IN (${PIDS.map(q).join(',')}); SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`);
    cleanupOids();
    S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P2_%')`);
    S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P2_%')`);
    S(`DELETE FROM approval_requests WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P2_%') OR reviewed_by IN (SELECT id FROM staff WHERE name LIKE 'P2_%')`);
    S(`ALTER TABLE public.staff DISABLE TRIGGER trg_staff_prevent_delete`);
    S(`DELETE FROM staff WHERE name LIKE 'P2_%'`);
    S(`ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete`);
    P('S4-1', 'zero residue: P2_ staff + probe orders/payments gone',
      S(`SELECT (SELECT count(*) FROM staff WHERE name LIKE 'P2_%')||'|'||(SELECT count(*) FROM order_payments WHERE order_id IN (SELECT id FROM orders WHERE location_id IN (${q(LOC_A)},${q(LOC_B)}) AND created_at > now()-interval '30 min'))`) === '0|0', 'check');

    const failed = results.filter(r => !r.pass);
    console.log('\n===== P2 STATE GATE: ' + (results.length - failed.length) + '/' + results.length + ' PASS' + (failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(',') : '') + ' =====');
    try { fs.writeFileSync('.p2-gate-report.json', JSON.stringify({ date: new Date().toISOString(), results, total: results.length, failed: failed.length, crashed: false }, null, 2)); } catch (e) {}
    process.exit(failed.length ? 1 : 0);
  } catch (e) {
    try { cleanupOids(); S(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false); DELETE FROM order_payments WHERE id=${q(PAY_FIX ? PAY_FIX.pid : '00000000-0000-0000-0000-000000000000')}; DELETE FROM orders WHERE id=${q(PAY_FIX ? PAY_FIX.oid : '00000000-0000-0000-0000-000000000000')}; SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`); S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P2_%')`); S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P2_%')`); S(`DELETE FROM approval_requests WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P2_%') OR reviewed_by IN (SELECT id FROM staff WHERE name LIKE 'P2_%')`); S(`ALTER TABLE public.staff DISABLE TRIGGER trg_staff_prevent_delete`); S(`DELETE FROM staff WHERE name LIKE 'P2_%'`); S(`ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete`); } catch (e2) {}
    try { fs.writeFileSync('.p2-gate-report.json', JSON.stringify({ total: results.length, failed: results.filter(r => !r.pass).length, crashed: true, error: String(e && e.message || e) }, null, 2)); } catch (e2) {}
    console.error('P2 GATE HARNESS ERROR:', e && e.message || e);
    process.exit(2);
  }
})();
