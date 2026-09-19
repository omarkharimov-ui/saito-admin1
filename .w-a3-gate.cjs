// W-A3 GATE — customer timeline (read-only aggregation, W_A3_PLAN.md T1-T8).
// Route-level E2E (real HTTP via :3000). Fixture: 1 staff + session (auth
// only), 2 customers, 2 products, 4 orders (paid/open/cancelled/paid).
// Proof points: stats computed live from orders (dead columns total_visits /
// total_spent set to bogus values on the customer row MUST be ignored),
// cancelled excluded, favorites ranked, newest-first, limit clamp, 404.
// Teardown: P-3 trusted flag for payment rows; F-contract staff neutralize.
// Run: node .w-a3-gate.cjs   (dev :3000, solo)
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOC_A='f1f830b3-cf15-47e3-a538-01abd8222c6d';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim().split('\n')[0]||'',err:(r.stderr||'').trim()};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='w3gate_csrf';
function http(path,body,token,method){method=method||'GET';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));if(body!==undefined)r.write(JSON.stringify(body));r.end();});}
const transErr=o=>!o||o.status===0||/ERR |ECONNRESET|socket hang up|client-timeout/i.test(o.body||'');
async function httpR(path,body,token,method){let last;for(let i=0;i<4;i++){last=await http(path,body,token,method);if(!transErr(last))return last;await sleep(700*(i+1));}return last;}

let PASS=0,FAIL=0; const results=[];
function R(id,name,ok,ev){
  if(ok)PASS++;else FAIL++;
  results.push({id,name,ok,evidence:String(ev).slice(0,320)});
  console.log((ok?'  PASS        ':'!!! FAIL      ')+id+' '+name+(ok?'':'\n   -> '+String(ev).slice(0,400)));
}
const n=x=>Number(x).toFixed(2);

(async()=>{
try{
  // ── fixture ─────────────────────────────────────────────────────────────
  const MROLE=S(`SELECT id::text FROM roles WHERE name='manager'`);
  const STAFF_ID=crypto.randomUUID(), TOK=crypto.randomUUID();
  const CUST1=crypto.randomUUID(), CUST2=crypto.randomUUID();
  const P1=crypto.randomUUID(), P2=crypto.randomUUID();
  const O1=crypto.randomUUID(), O2=crypto.randomUUID(), O3=crypto.randomUUID(), O4=crypto.randomUUID();
  const O2a=crypto.randomUUID(), O2b=crypto.randomUUID(); // CUST2 orders (limit clamp)
  const TBL=1600+Number((Sx(`SELECT coalesce(max(table_number),0)::text FROM table_floors WHERE table_number BETWEEN 1600 AND 1700`).out||'0')%5);
  console.log(`W-A3 FIXTURE: customer=${CUST1.slice(0,8)} orders O1..O4 @table base ${TBL}`);
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(STAFF_ID)},'W3_MGR','W3_MGR',${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES (${q(STAFF_ID)},${q(LOC_A)},true,true,${q(ORG)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(TOK)},${q(STAFF_ID)},'manager',now()+interval '24h','ACTIVE',${q(ORG)},${q(LOC_A)})`);
  S(`INSERT INTO products(id,name,price,cost_price,is_active) VALUES (${q(P1)},'W3_P1',50.00,NULL,true),(${q(P2)},'W3_P2',25.00,NULL,true)`);
  // T2 proof: dead columns set to BOGUS values — the timeline must ignore them.
  S(`INSERT INTO customers(id,name,phone,total_visits,total_spent,last_order_at,created_at) VALUES (${q(CUST1)},'W3_CUST','11188889101',999,999999.00,now()-interval '30 days',now()-interval '90 days'),(${q(CUST2)},'W3_CUST2','11188889102',0,0,NULL,now())`);
  S(`INSERT INTO orders(id,table_number,status,guest_count,total_amount,paid_amount,location_id,organization_id,kitchen_status,is_draft,order_type,customer_id,customer_name,customer_phone,created_at,updated_at,version) VALUES
    (${q(O1)},${TBL},'paid',2,150.00,150.00,${q(LOC_A)},${q(ORG)},'pending',false,'dine_in',${q(CUST1)},'W3_CUST','11188889101',now()-interval '2 days',now()-interval '2 days',1),
    (${q(O2)},${TBL+1},'new',2,75.00,0,${q(LOC_A)},${q(ORG)},'pending',false,'dine_in',${q(CUST1)},'W3_CUST','11188889101',now()-interval '1 hour',now()-interval '1 hour',1),
    (${q(O3)},${TBL+2},'cancelled',1,25.00,0,${q(LOC_A)},${q(ORG)},'pending',false,'dine_in',${q(CUST1)},'W3_CUST','11188889101',now()-interval '3 days',now()-interval '3 days',1),
    (${q(O4)},${TBL+3},'paid',1,50.00,50.00,${q(LOC_A)},${q(ORG)},'pending',false,'dine_in',${q(CUST1)},'W3_CUST','11188889101',now()-interval '4 days',now()-interval '4 days',1),
    (${q(O2a)},${TBL+4},'new',1,25.00,0,${q(LOC_A)},${q(ORG)},'pending',false,'dine_in',${q(CUST2)},'W3_CUST2','11188889102',now()-interval '5 days',now()-interval '5 days',1),
    (${q(O2b)},${TBL+5},'paid',1,100.00,100.00,${q(LOC_A)},${q(ORG)},'pending',false,'dine_in',${q(CUST2)},'W3_CUST2','11188889102',now()-interval '6 days',now()-interval '6 days',1)`);
  S(`INSERT INTO order_items(order_id,product_id,quantity,unit_price,product_name,total_price,kitchen_status,created_at,updated_at) VALUES
    (${q(O1)},${q(P1)},2,50.00,'W3_P1',100.00,'pending',now()-interval '2 days',now()-interval '2 days'),
    (${q(O1)},${q(P2)},2,25.00,'W3_P2',50.00,'pending',now()-interval '2 days',now()-interval '2 days'),
    (${q(O2)},${q(P1)},1,50.00,'W3_P1',50.00,'pending',now()-interval '1 hour',now()-interval '1 hour'),
    (${q(O2)},${q(P2)},1,25.00,'W3_P2',25.00,'pending',now()-interval '1 hour',now()-interval '1 hour'),
    (${q(O3)},${q(P2)},1,25.00,'W3_P2',25.00,'pending',now()-interval '3 days',now()-interval '3 days'),
    (${q(O4)},${q(P1)},1,50.00,'W3_P1',50.00,'pending',now()-interval '4 days',now()-interval '4 days'),
    (${q(O2a)},${q(P2)},1,25.00,'W3_P2',25.00,'pending',now()-interval '5 days',now()-interval '5 days'),
    (${q(O2b)},${q(P1)},2,50.00,'W3_P1',100.00,'pending',now()-interval '6 days',now()-interval '6 days')`);
  S(`INSERT INTO order_payments(order_id,payment_method,method,amount,status,is_refund) VALUES
    (${q(O1)},'card','card',150.00,'captured',false),
    (${q(O4)},'cash','cash',50.00,'captured',false),
    (${q(O2b)},'card','card',100.00,'captured',false)`);
  await sleep(4000); // session validation settle
  // Baseline BEFORE any timeline call — the fixture INSERTs themselves may
  // fire triggers; W3-08 asserts the timeline adds NO delta on top.
  const base8=Sx(`SELECT (SELECT count(*) FROM audit_logs WHERE record_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))||'/'||(SELECT count(*) FROM operation_logs WHERE order_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))||'/'||(SELECT count(*) FROM outbox_events WHERE aggregate_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))||'/'||(SELECT count(*) FROM order_events WHERE order_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))`).out;

  const ms=(oid)=>Number(S(`SELECT extract(epoch FROM created_at)*1000 FROM orders WHERE id=${q(oid)}`));

  // ── W3-01: shape + T2 dead-column proof ─────────────────────────────────
  const t1=await httpR(`/api/customers/${CUST1}/timeline?limit=50`,undefined,TOK);
  const d1=t1.data||{};
  R('W3-01','timeline -> 200 + customer/stats/orders/favorites shape; dead total_visits/total_spent NOT exposed', t1.status===200&&d1.customer&&d1.customer.id===CUST1&&d1.customer.total_visits===undefined&&d1.customer.total_spent===undefined&&!!d1.stats&&Array.isArray(d1.orders)&&Array.isArray(d1.favorites), `status=${t1.status} keys=${Object.keys(d1).join(',')} body=${(t1.body||'').slice(0,200)}`);

  // ── W3-02: stats live-computed (cancelled excluded; bogus cols ignored) ─
  const st=d1.stats||{};
  R('W3-02','stats: visits=3 (cancelled excluded), spent=200.00, avg=91.67, items=7, first=O4, last=O2', st.visit_count===3&&n(st.total_spent)==='200.00'&&n(st.avg_order)==='91.67'&&st.items_ordered===7&&Math.abs(new Date(st.first_visit).getTime()-ms(O4))<1000&&Math.abs(new Date(st.last_visit).getTime()-ms(O2))<1000, JSON.stringify(st));

  // ── W3-03: orders[] newest-first + items/payments embedded ──────────────
  const ord=d1.orders||[];
  const ids=ord.map(o=>o.id).join(',');
  const o1row=ord.find(o=>o.id===O1);
  R('W3-03','orders[]: [O2,O1,O3,O4] newest-first; O1 has 2 items + card 150 captured; cancelled O3 present in history', ids===`${O2},${O1},${O3},${O4}`&&o1row&&o1row.items.length===2&&o1row.payments.length===1&&o1row.payments[0].method==='card'&&n(o1row.payments[0].amount)==='150.00'&&o1row.payments[0].is_refund===false, `ids=${ids} o1items=${o1row&&o1row.items.length} o1pay=${o1row&&JSON.stringify(o1row.payments)}`);

  // ── W3-04: favorites ranked, cancelled excluded ─────────────────────────
  const fav=(d1.favorites||[]).map(f=>`${f.name}:${f.qty}`).join(',');
  R('W3-04','favorites: W3_P1:4 > W3_P2:3 (cancelled O3 item excluded)', fav==='W3_P1:4,W3_P2:3', `fav=${fav}`);

  // ── W3-05: limit clamp (limit=1 -> newest only) ─────────────────────────
  const t2=await httpR(`/api/customers/${CUST1}/timeline?limit=1`,undefined,TOK);
  R('W3-05','limit=1 -> exactly [O2] (newest), stats unaffected by limit', t2.status===200&&t2.data.orders.length===1&&t2.data.orders[0].id===O2&&t2.data.stats.visit_count===3, `len=${t2.data&&t2.data.orders.length} first=${t2.data&&t2.data.orders[0]&&t2.data.orders[0].id} visits=${t2.data&&t2.data.stats&&t2.data.stats.visit_count}`);

  // ── W3-06: second customer works (isolation) ────────────────────────────
  const t3=await httpR(`/api/customers/${CUST2}/timeline`,undefined,TOK);
  R('W3-06','customer 2 isolated: visits=2, spent=100.00, favorites W3_P1:2,W3_P2:1', t3.status===200&&t3.data.stats.visit_count===2&&n(t3.data.stats.total_spent)==='100.00'&&(t3.data.favorites||[]).map(f=>`${f.name}:${f.qty}`).join(',')==='W3_P1:2,W3_P2:1', `stats=${JSON.stringify(t3.data&&t3.data.stats)} fav=${t3.data&&t3.data.favorites}`);

  // ── W3-07: unknown customer -> 404, bad id -> 400, unauth -> 401 ────────
  const t4=await httpR(`/api/customers/${crypto.randomUUID()}/timeline`,undefined,TOK);
  const t5=await httpR(`/api/customers/not-a-uuid/timeline`,undefined,TOK);
  const t6=await httpR(`/api/customers/${CUST1}/timeline`,undefined,null);
  R('W3-07','unknown id 404 "Customer not found" · bad id 400 · no session 401', t4.status===404&&(t4.data&&t4.data.error)==='Customer not found'&&t5.status===400&&t6.status===401, `s=${t4.status}/${t5.status}/${t6.status} body404=${(t4.body||'').slice(0,80)}`);

  // ── W3-08: read-only proof — no new writes (audit/outbox/op-logs empty) ─
  const w8=Sx(`SELECT (SELECT count(*) FROM audit_logs WHERE record_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))||'/'||(SELECT count(*) FROM operation_logs WHERE order_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))||'/'||(SELECT count(*) FROM outbox_events WHERE aggregate_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))||'/'||(SELECT count(*) FROM order_events WHERE order_id IN (${q(O1)},${q(O2)},${q(O3)},${q(O4)}))`).out;
  R('W3-08','timeline is read-only: no delta in audit/op-log/outbox/order-event after 5 timeline calls', w8===base8, `base=${base8} after=${w8}`);

  // ── W3-09: teardown + zero-residue ──────────────────────────────────────
  const list=[O1,O2,O3,O4,O2a,O2b].map(q).join(',');
  const tx=Sx(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false);
    DELETE FROM payment_idempotency_keys WHERE order_id IN (${list});
    DELETE FROM order_payments WHERE order_id IN (${list});
    DELETE FROM payments WHERE order_id IN (${list});
    DELETE FROM outbox_events WHERE aggregate_id IN (${list});
    DELETE FROM audit_logs WHERE record_id IN (${list});
    DELETE FROM audit_logs_canonical WHERE entity_id IN (${list});
    DELETE FROM operation_logs WHERE order_id IN (${list});
    DELETE FROM order_events WHERE order_id IN (${list});
    DELETE FROM cancelled_orders WHERE order_id IN (${list});
    DELETE FROM kitchen_schedule WHERE order_id IN (${list});
    DELETE FROM inventory_logs WHERE order_id IN (${list}) OR order_item_id IN (SELECT id FROM order_items WHERE order_id IN (${list}));
    DELETE FROM order_items WHERE order_id IN (${list});
    DELETE FROM orders WHERE id IN (${list});
    DELETE FROM customers WHERE id IN (${q(CUST1)},${q(CUST2)});
    DELETE FROM products WHERE id IN (${q(P1)},${q(P2)});
    SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`);
  Sx(`UPDATE staff SET is_active=false,status='INACTIVE',pin_hash='' WHERE name='W3_MGR'`);
  Sx(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name='W3_MGR')`);
  Sx(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name='W3_MGR')`);
  const res=Sx(`SELECT (SELECT count(*)::text FROM orders WHERE id IN (${list}))||'/'||(SELECT count(*)::text FROM order_items WHERE order_id IN (${list}))||'/'||(SELECT count(*)::text FROM customers WHERE id IN (${q(CUST1)},${q(CUST2)}))||'/'||(SELECT count(*)::text FROM products WHERE id IN (${q(P1)},${q(P2)}))||'/'||(SELECT count(*)::text FROM staff WHERE name='W3_MGR' AND (is_active OR status='ACTIVE' OR pin_hash<>''))||'/'||(SELECT count(*)::text FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name='W3_MGR'))`).out;
  R('W3-09','teardown zero-residue (orders/items/customers/products/staff-active/sessions)', tx.status===0&&res==='0/0/0/0/0/0', `residue=${res||'query-err'} txerr=${tx.err.slice(0,200)}`);

  console.log(`\nW-A3 GATE: PASS=${PASS} FAIL=${FAIL}`);
  fs.writeFileSync('.w-a3-result.json',JSON.stringify({pass:PASS,fail:FAIL,results},null,2));
  process.exit(FAIL>0?1:0);
}catch(e){
  console.error('GATE CRASH: '+e.message);
  console.error(e.stack&&e.stack.slice(0,800));
  process.exit(2);
}
})();
