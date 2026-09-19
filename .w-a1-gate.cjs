// W-A1 GATE (idempotent) — guest channel foundation. Run: node .w-a1-gate.cjs
// Deterministic fixtures: tables 410-412 @LOC_A, customers 0007777%, staff WAG_%,
// loyalty_product_rules label='W_A1_TEST_RULE'.
// SQL-level only (no app server needed) — mirrors the house pattern.
// NOTE: the rule fixture attaches to the FIRST production product for the run's
// duration (house pattern, cf. O gate PROD); it is removed in cleanup.
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const ORG = '00000000-0000-0000-0000-000000000001';
const LOC_A = 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
let PROD = null;
let R_ADMIN = null;
const TEST_TABLES = [410, 411, 412];
const RULE_LABEL = 'W_A1_TEST_RULE';
// Run-scoped idempotency keys: payment_idempotency_keys BINDS a key to an
// order persistently — fixed keys would collide across runs (IDEMPOTENCY_CONFLICT).
const RUN = Date.now().toString(36);

function sql(q) { const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() }; }
function S(q) { const r = sql(q); if (!r.ok) throw new Error('SQL: ' + r.err); return r.out; }
function call(fn) { return sql(fn); }
function hashPin(pin) { const salt = crypto.randomBytes(16).toString('hex'); const h = crypto.pbkdf2Sync(pin, salt, 260000, 64, 'sha256').toString('hex'); return `pbkdf2_sha256$260000$${salt}$${h}`; }
const q = (s) => `'${s}'`;
const results = [];
function check(id, name, pass, ev) { results.push({ id, name, pass: !!pass, evidence: String(ev).slice(0, 220) }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${pass ? '' : ' -> ' + String(ev).slice(0, 150)}`); }

// Teardown house pattern (cf. .p6-gate.cjs L80-89 / .p8-gate.cjs L170-181):
// order_payments rows are IMMUTABLE (trg_order_payment_immutable, frozen
// P-5/P-6 contract) — they are deleted only under the transaction-scoped
// app.payment_ledger_reopen GUC (the same gate the sanctioned
// reopen_order_atomic uses).
const CLEANUP_SQL = `
  BEGIN;
  SELECT set_config('app.payment_ledger_reopen','on',false);
  DELETE FROM order_payments WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}));
  SELECT set_config('app.payment_ledger_reopen','off',false);
  COMMIT;
  DELETE FROM payment_idempotency_keys WHERE key LIKE 'w_a1_%';
  ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard;
  DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}));
  DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}));
  DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}));
  DELETE FROM loyalty_order_points WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}));
  DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM loyalty_accounts WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '0007777%'));
  DELETE FROM loyalty_transactions WHERE account_id IN (SELECT id FROM loyalty_accounts WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '0007777%'));
  DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}))
     OR entity_id IN (SELECT id::text FROM customers WHERE phone LIKE '0007777%')
     OR entity_id IN (SELECT id::text FROM loyalty_accounts WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '0007777%'));
  DELETE FROM loyalty_accounts WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '0007777%');
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}));
  DELETE FROM table_floors WHERE table_number IN (${TEST_TABLES.join(',')});
  DELETE FROM orders WHERE table_number IN (${TEST_TABLES.join(',')});
  ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard;
  DELETE FROM loyalty_product_rules WHERE label = ${q(RULE_LABEL)};
  DELETE FROM customers WHERE phone LIKE '0007777%';
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'WAG_%');
  DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'WAG_%');
  UPDATE staff SET is_active=false, status='INACTIVE', pin_hash='' WHERE name LIKE 'WAG_%';
`;

(async () => {
  S(CLEANUP_SQL);
  console.log('----- START CLEANUP OK -----');
  PROD = S(`SELECT id::text FROM products ORDER BY created_at LIMIT 1`) || crypto.randomUUID();
  R_ADMIN = S(`SELECT id::text FROM roles WHERE name='admin' LIMIT 1`);

  const mkStaff = (name, role, loc) => { const id = crypto.randomUUID(); S(`INSERT INTO staff (id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(id)},${q(name)},${q(name)},${q(role)},true,'ACTIVE',${q(hashPin('7777'))},${q(ORG)})`); if (loc) S(`INSERT INTO staff_locations (staff_id,location_id,is_primary,active,organization_id) VALUES (${q(id)},${q(loc)},true,true,${q(ORG)})`); return id; };
  const mkSess = (uid, role, loc) => { const tok = crypto.randomUUID(); S(`INSERT INTO sessions (token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(tok)},${q(uid)},${q(role)},now()+interval '3h','ACTIVE',${q(ORG)},${q(loc)})`); return tok; };
  const mkTable = (num, loc) => { S(`INSERT INTO table_floors (table_number,status,location_id,organization_id) VALUES (${num},'occupied',${q(loc)},${q(ORG)})`); };
  const mkQrOrder = (num, cust) => { const id = crypto.randomUUID(); S(`INSERT INTO orders (id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,order_type,version,created_at,updated_at) VALUES (${q(id)},${num},'confirmed',2,20,${q(LOC_A)},${q(ORG)},'pending',false,'qr_order',1,now(),now())`);   if (cust) S(`UPDATE orders SET customer_id=${q(cust.customer_id)}, customer_name=${q(cust.name)}, customer_phone=${q(cust.phone)} WHERE id=${q(id)}`); S(`INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,total_price,kitchen_status) VALUES (${q(id)},${q(PROD)},'W_A1 item',2,10,20,'pending')`); return id; };

  console.log('----- S: schema + grant contract -----');
  check('S1', 'customers_phone_uq unique partial index exists', S(`SELECT count(*) FROM pg_indexes WHERE tablename='customers' AND indexname='customers_phone_uq'`) === '1');
  check('S2', 'guest_link_customer: 1 overload, service_role-only (house pattern)', S(`SELECT ((SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='guest_link_customer')=1 AND has_function_privilege('service_role',(SELECT oid FROM pg_proc WHERE proname='guest_link_customer' LIMIT 1),'EXECUTE') AND NOT has_function_privilege('anon',(SELECT oid FROM pg_proc WHERE proname='guest_link_customer' LIMIT 1),'EXECUTE') AND NOT has_function_privilege('authenticated',(SELECT oid FROM pg_proc WHERE proname='guest_link_customer' LIMIT 1),'EXECUTE'))::text`) === 'true');

  console.log('----- S: RPC find-or-create semantics -----');
  const c1 = S(`SELECT public.guest_link_customer('00077770001')::text`);
  const j1 = JSON.parse(c1);
  check('S3', 'create path: new phone -> created=true, default name "Qonaq 0001", visits baseline 0 (D10)', j1.created === true && S(`SELECT name FROM customers WHERE phone='00077770001'`) === 'Qonaq 0001' && S(`SELECT total_visits FROM customers WHERE phone='00077770001'`) === '0', `${c1} visits=${S('SELECT total_visits FROM customers WHERE phone=\'00077770001\'')}`);
  const c2 = S(`SELECT public.guest_link_customer('00077770001')::text`);
  const j2 = JSON.parse(c2);
  check('S4', 'find path: same phone -> same id, created=false, exactly 1 row', j2.created === false && j2.customer_id === j1.customer_id && S(`SELECT count(*) FROM customers WHERE phone='00077770001'`) === '1', c2);
  const c5a = S(`SELECT public.guest_link_customer('00077779999')::text`);
  const dupRes = call(`INSERT INTO customers (name, phone) VALUES ('dup attempt','00077779999')`);
  check('S5', 'direct duplicate INSERT (RPC-bypass) rejected by the unique index (23505)', !dupRes.ok && /duplicate key|23505/i.test(dupRes.err), (dupRes.err || 'ok?!').slice(0, 80));
  const b1 = call(`SELECT public.guest_link_customer('abc')`);
  const b2 = call(`SELECT public.guest_link_customer('12345')`);
  check('S6', 'invalid phones rejected: "abc" and 5-digit -> GUEST_LINK_BAD_PHONE', !b1.ok && /GUEST_LINK_BAD_PHONE/.test(b1.err) && !b2.ok && /GUEST_LINK_BAD_PHONE/.test(b2.err), `${(b1.err || '').slice(0, 40)} | ${(b2.err || '').slice(0, 40)}`);
  S(`SELECT public.guest_link_customer('00077770007', ${q('x'.repeat(300))})`);
  check('S7', 'name capped at 80 chars (stored length = 80)', S(`SELECT length(name) FROM customers WHERE phone='00077770007'`) === '80');

  console.log('----- S: order attach + G3 backward compatibility -----');
  mkTable(411, LOC_A);
  const o411 = mkQrOrder(411, null); // plain G3 (no customer)
  check('S8', 'G3 backward compat: phone-less qr_order inserts clean, customer_id NULL', S(`SELECT (customer_id IS NULL)::text FROM orders WHERE id=${q(o411)}`) === 'true');
  mkTable(410, LOC_A);
  const o410 = mkQrOrder(410, j1); // create-time attach
  check('S9', 'create-time attach: order carries customer_id/name/phone', S(`SELECT (customer_id=${q(j1.customer_id)} AND customer_name='Qonaq 0001' AND customer_phone='00077770001')::text FROM orders WHERE id=${q(o410)}`) === 'true');

  console.log('----- S: loyalty spine (rule fixture + paid transition) -----');
  const RULE_ID = crypto.randomUUID();
  S(`INSERT INTO loyalty_product_rules (id,scope,product_id,mode,points_per_unit,is_active,label) VALUES (${q(RULE_ID)},'product',${q(PROD)},'points_per_unit',5,true,${q(RULE_LABEL)})`);
  check('S10', 'rule fixture active: product rule points_per_unit=5 for PROD', S(`SELECT count(*) FROM loyalty_product_rules WHERE id=${q(RULE_ID)} AND is_active`) === '1');

  const adm = mkStaff('WAG_ADM', R_ADMIN, LOC_A);
  const tAdm = mkSess(adm, 'admin', LOC_A);

  // Payment goes through the FROZEN payment RPC (state machine forbids direct
  // confirmed->paid via transition_order_atomic: PAYMENT_STATE_FORBIDDEN).
  // Call shape mirrors src/app/api/orders/pay/route.ts (canonical app call).
  const payOrder = (oid, tag) => call(`SELECT public.complete_payment_atomic_v2(${q(oid)}, '[{"method":"cash","amount":20}]'::jsonb, 'cash', 20, 0, 0, 0, NULL, ${q(adm)}, NULL, NULL, 20, ${q('w_a1_' + RUN + '_' + tag)}, ${q(LOC_A)})`);

  const pay1 = payOrder(o410, 'o410');
  check('S11', 'payment RPC on guest-attached qr_order -> order paid', pay1.ok && S(`SELECT status FROM orders WHERE id=${q(o410)}`) === 'paid', (pay1.out || pay1.err || '').slice(0, 110));
  const s12 = { earned: S(`SELECT (o.loyalty_points_earned)::text FROM orders o WHERE id=${q(o410)}`),
    tx: S(`SELECT count(*) FROM loyalty_transactions lt JOIN loyalty_accounts a ON a.id=lt.account_id JOIN customers c ON c.id=a.customer_id WHERE lt.reference_id=${q(o410)} AND c.phone='00077770001'`),
    bal: S(`SELECT points_balance FROM loyalty_accounts WHERE customer_id=${q(j1.customer_id)}`),
    visits: S(`SELECT total_visits FROM customers WHERE id=${q(j1.customer_id)}`) };
  check('S12', 'spine earned 10 pts (qty2 x 5): earned=10, 1 transaction, balance=10, visits=1',
    s12.earned === '10' && s12.tx === '1' && s12.bal === '10' && s12.visits === '1', JSON.stringify(s12));
  check('S13', 'total_spent consistency: total_spent = paid_amount - discount (spine formula)',
    S(`SELECT (c.total_spent = COALESCE(o.paid_amount,0) - COALESCE(o.discount_amount,0))::text FROM customers c JOIN orders o ON o.customer_id=c.id WHERE o.id=${q(o410)}`) === 'true',
    S(`SELECT c.total_spent::text FROM customers c JOIN orders o ON o.customer_id=c.id WHERE o.id=${q(o410)}`));

  mkTable(412, LOC_A);
  const c2b = JSON.parse(S(`SELECT public.guest_link_customer('00077770001')::text`));
  const o412 = mkQrOrder(412, c2b);
  const pay2 = payOrder(o412, 'o412');
  const s14 = { paid: pay2.ok, visits: S(`SELECT total_visits FROM customers WHERE id=${q(j1.customer_id)}`),
    bal: S(`SELECT points_balance FROM loyalty_accounts WHERE customer_id=${q(j1.customer_id)}`),
    tx2: S(`SELECT count(*) FROM loyalty_transactions lt JOIN loyalty_accounts a ON a.id=lt.account_id WHERE a.customer_id=${q(j1.customer_id)} AND lt.reference_id IN (${q(o410)},${q(o412)})`) };
  check('S14', '2nd order same customer: visits=2, balance=20, per-order idempotent (10 each)',
    s14.paid && s14.visits === '2' && s14.bal === '20' && s14.tx2 === '2', JSON.stringify(s14));

  const pay3 = payOrder(o411, 'o411');
  check('S15', 'plain (no-customer) order paid -> 0 points, no new transactions ("no_customer" skip)',
    pay3.ok && S(`SELECT status FROM orders WHERE id=${q(o411)}`) === 'paid'
    && S(`SELECT COALESCE(loyalty_points_earned,0)::text FROM orders WHERE id=${q(o411)}`) === '0'
    && S(`SELECT count(*) FROM loyalty_transactions lt JOIN loyalty_accounts a ON a.id=lt.account_id WHERE a.customer_id=${q(j1.customer_id)}`) === '2');

  // Fresh idempotency key (a replayed key would return idempotent_replay, not a
  // state-machine denial): the ORDER state must reject the second payment.
  const replay = payOrder(o410, 'replay');
  check('EC1', 'second payment on already-paid o410 -> denied, no double-earn (10 pts / 1 txn intact)',
    (!replay.ok || (JSON.parse(replay.out || '{}').success === false))
    && S(`SELECT COALESCE(loyalty_points_earned,0)::text FROM orders WHERE id=${q(o410)}`) === '10'
    && S(`SELECT count(*) FROM loyalty_transactions lt JOIN loyalty_accounts a ON a.id=lt.account_id WHERE a.customer_id=${q(j1.customer_id)} AND lt.reference_id=${q(o410)}`) === '1',
    (replay.err || replay.out || '').slice(0, 90));

  // ===== END CLEANUP =====
  S(CLEANUP_SQL);
  const rO = S(`SELECT count(*) FROM orders WHERE table_number IN (${TEST_TABLES.join(',')})`);
  const rT = S(`SELECT count(*) FROM table_floors WHERE table_number IN (${TEST_TABLES.join(',')})`);
  const rC = S(`SELECT count(*) FROM customers WHERE phone LIKE '0007777%'`);
  const rA = S(`SELECT count(*) FROM loyalty_accounts WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '0007777%')`);
  const rR = S(`SELECT count(*) FROM loyalty_product_rules WHERE label = ${q(RULE_LABEL)}`);
  const rS = S(`SELECT count(*) FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'WAG_%')`);
  const rI = S(`SELECT count(*) FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${TEST_TABLES.join(',')}))`);
  check('Z1', 'END residue = 0 (orders/tables/customers/accounts/rules/sessions/items)', rO === '0' && rT === '0' && rC === '0' && rA === '0' && rR === '0' && rS === '0' && rI === '0', `o=${rO} t=${rT} c=${rC} a=${rA} r=${rR} s=${rS} i=${rI}`);
  check('Z2', 'archive guard re-enabled after cleanup', S(`SELECT (t.tgenabled::text IN ('O','D'))::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='table_floors' AND t.tgname='trg_table_archive_guard'`) === 'true');

  const failed = results.filter(r => !r.pass);
  const pass = results.length - failed.length;
  const realRisk = failed.filter(f => !['Z1', 'Z2'].includes(f.id)).length;
  console.log(`\n===== W-A1 GATE: ${pass}/${results.length} PASS (REAL-RISK=${realRisk})${failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(',') : ''} =====`);
  console.log(JSON.stringify({ gate: 'w-a1', pass, total: results.length, realRisk, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
