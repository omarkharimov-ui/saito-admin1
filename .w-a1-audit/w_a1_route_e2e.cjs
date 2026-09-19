// W-A1 ROUTE E2E (real HTTP path through the dev server): proves /api/orders/qr
// passes customer_phone -> guest_link_customer -> order attach, and the status
// route reads it back. Runs on dedicated table 415 (LOC_A) with guaranteed
// cleanup in finally. NOT part of the frozen gate set — evidence artifact.
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const ORG = '00000000-0000-0000-0000-000000000001';
const LOC_A = 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
const APP = 'http://localhost:3000';
const TBL = 415;
const PHONE = '00077779002';
function S(q) { const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' }); if (r.status !== 0) throw new Error('SQL: ' + r.stderr.trim()); return r.stdout.trim(); }
const q = (s) => `'${s}'`;
const results = [];
function check(id, name, pass, ev) { results.push({ id, pass: !!pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${pass ? '' : ' -> ' + String(ev).slice(0, 160)}`); }
const PROD = S(`SELECT id::text FROM products ORDER BY created_at LIMIT 1`);

(async () => {
  // setup: dedicated table
  S(`INSERT INTO table_floors (table_number,status,location_id,organization_id) VALUES (${TBL},'occupied',${q(LOC_A)},${q(ORG)})`);
  let orderId = null;
  try {
    // E1: bad phone + real table -> 400 (route pre-validation, before RPC/order)
    const e1 = await fetch(APP + '/api/orders/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_number: TBL, items: [{ product_id: PROD, quantity: 1, unit_price: 5 }], customer_phone: 'abc' }) });
    const e1b = await e1.json();
    check('E1', 'bad phone -> 400 Invalid phone (no order, no customer)', e1.status === 400 && /invalid phone/i.test(e1b.error) && S(`SELECT count(*) FROM orders WHERE table_number=${TBL}`) === '0' && S(`SELECT count(*) FROM customers WHERE phone=${q(PHONE)}`) === '0', `status=${e1.status} ${e1b.error}`);

    // E2: valid phone + name -> 200, order created WITH customer attached
    const e2 = await fetch(APP + '/api/orders/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_number: TBL, items: [{ product_id: PROD, product_name: 'E2 item', quantity: 1, unit_price: 5 }], order_type: 'qr_order', customer_phone: PHONE, customer_name: 'RouteTest' }) });
    const e2b = await e2.json();
    orderId = e2b.orderId || null;
    const custId = S(`SELECT id::text FROM customers WHERE phone=${q(PHONE)}`);
    check('E2', 'valid phone -> 200 success, customer created (name RouteTest) + order attached', e2.status === 200 && e2b.success === true && !!custId && S(`SELECT name FROM customers WHERE phone=${q(PHONE)}`) === 'RouteTest' && S(`SELECT (customer_id=${q(custId)} AND customer_phone=${q(PHONE)} AND order_type='qr_order')::text FROM orders WHERE table_number=${TBL}`) === 'true', `status=${e2.status} ${JSON.stringify(e2b).slice(0, 100)} cust=${custId}`);

    // E3: status route reads the order back (customer_linked=true)
    const e3 = await fetch(APP + `/api/orders/qr/status?table=${TBL}`);
    const e3b = await e3.json();
    check('E3', 'status route: has_order=true, customer_linked=true, status=confirmed', e3.status === 200 && e3b.has_order === true && e3b.order?.customer_linked === true && e3b.order?.status === 'confirmed', `status=${e3.status} ${JSON.stringify(e3b.order || {}).slice(0, 100)}`);

    // E4 (D11, W_A1_PLAN.md): frozen G3 contract = ONE active order per table
    // (idx_orders_active_table, O-freeze). A 2nd POST must be REJECTED with the
    // unique violation, find the SAME customer (no dup), and leave the active
    // order untouched. Customer-side "add to check" is a future-wave product
    // decision — W-A1 does not change G3 order-creation semantics.
    const e4 = await fetch(APP + '/api/orders/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_number: TBL, items: [{ product_id: PROD, product_name: 'E4 item', quantity: 1, unit_price: 3 }], order_type: 'qr_order', customer_phone: PHONE }) });
    const e4b = await e4.json();
    const activeBefore = orderId;
    check('E4', 'repeat phone on active table -> rejected (frozen one-active-order/table), find path (1 customer), order untouched', e4.status === 500 && /unique|23505/i.test(e4b.error || '') && S(`SELECT count(*) FROM customers WHERE phone=${q(PHONE)}`) === '1' && S(`SELECT count(*) FROM orders WHERE table_number=${TBL}`) === '1' && S(`SELECT id::text FROM orders WHERE table_number=${TBL}`) === activeBefore, `status=${e4.status} err=${String(e4b.error).slice(0,80)} customers=${S(`SELECT count(*) FROM customers WHERE phone=${q(PHONE)}`)}`);
  } finally {
    // guaranteed teardown (confirmed orders: no payment record -> plain delete; guard disabled for the table row)
    try {
      S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
      S(`UPDATE table_floors SET current_order_id=NULL WHERE table_number=${TBL}`);
      S(`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM orders WHERE table_number=${TBL})`);
      S(`DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number=${TBL})`);
      S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number=${TBL})`);
      S(`DELETE FROM loyalty_order_points WHERE order_id IN (SELECT id FROM orders WHERE table_number=${TBL})`);
      S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number=${TBL})`);
      S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number=${TBL}) OR entity_id IN (SELECT id::text FROM customers WHERE phone=${q(PHONE)})`);
      S(`DELETE FROM orders WHERE table_number=${TBL}`);
      S(`DELETE FROM table_floors WHERE table_number=${TBL}`);
      S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
      S(`DELETE FROM customers WHERE phone=${q(PHONE)}`);
    } catch (e) { console.log('TEARDOWN WARN: ' + e.message.slice(0, 160)); }
    const resO = S(`SELECT count(*) FROM orders WHERE table_number=${TBL}`);
    const resT = S(`SELECT count(*) FROM table_floors WHERE table_number=${TBL}`);
    const resC = S(`SELECT count(*) FROM customers WHERE phone=${q(PHONE)}`);
    check('Z1', 'E2E residue = 0 (orders/table/customer)', resO === '0' && resT === '0' && resC === '0', `o=${resO} t=${resT} c=${resC}`);
  }
  const failed = results.filter(r => !r.pass);
  console.log(`\n===== W-A1 ROUTE E2E: ${results.length - failed.length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(',') : ''} =====`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
