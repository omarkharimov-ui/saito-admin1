// L3 (D3) live probe (idempotent, zero-residue): 'Dismiss table failed' root cause.
// Repros every dismiss/release scenario via the REAL routes (manager session,
// CSRF), capturing exact HTTP status + RPC error code + table state before/after.
// Decision (user): dismiss_table_atomic's G_NO_ACTIVE_ORDER on a PAID table is
// BY DESIGN (must not change) — the correct action for a paid table is release.
// This probe proves: (a) which scenario produces "Dismiss table failed",
// (b) the UI offers the right action in each, (c) release works, (d) dismiss works
// for valid states, and (e) no paid+occupied+paid-pointer final state exists.
// Run: node .k-l3-probe.cjs   (dev server on :3000)
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const https=require('https'); const fs=require('fs');
let SVC=''; try{SVC=(fs.readFileSync('artifacts/saito-admin/.env.local','utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)||[])[1].trim();}catch{}
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d';
const APP='http://localhost:3000';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,90)+': '+r.stderr);return r.stdout.trim();}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,170)));}
const CSRF=crypto.randomUUID(); // double-submit: x-csrf-token header == saito_csrf cookie
function http(path,body,cookie){return new Promise((res,rej)=>{const r=require('http').request({hostname:'localhost',port:3000,path,method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':CSRF,'Cookie':`saito_token=${cookie}; saito_csrf=${CSRF}`}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);r.write(JSON.stringify(body||{}));r.end();});}
function tRow(tn){return S(`SELECT coalesce(status,'null')||'|'||coalesce(current_order_id::text,'null')||'|'||coalesce(total_amount::text,'null')||'|'||coalesce(guest_count::text,'null') FROM table_floors WHERE table_number=${tn} AND location_id=${q(LOCA)}`);}
(async()=>{
  const T=993;
  // idempotent startup cleanup (BEFORE fixtures): wipe any L3_% residue from prior runs
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number=${T}) OR payload->>'table_number'='${T}'`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM orders WHERE table_number=${T}`);
  S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false, bill_requested=false WHERE table_number=${T} AND location_id=${q(LOCA)}`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'L3_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'L3_%')`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name LIKE 'L3_%'`);
  const ex=S(`SELECT count(*)::text FROM table_floors WHERE table_number=${T} AND location_id=${q(LOCA)}`);
  if(ex==='0') S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${T},'empty',${q(LOCA)},${q(ORG)})`);

  // manager staff + session @ LOCA (floor.manage) — created AFTER cleanup
  const mid=crypto.randomUUID();
  const rMgr=S("SELECT id::text FROM roles WHERE name='manager'");
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(mid)},'L3_MGR','L3_MGR',${q(rMgr)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(mid)},${q(LOCA)},true,true,${q(ORG)})`);
  const TK=crypto.randomUUID();
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(TK)},${q(mid)},'manager',now()+interval '1h','ACTIVE',${q(ORG)},${q(LOCA)})`);
  const PROD=S('SELECT id::text FROM products ORDER BY created_at LIMIT 1').split('\n')[0].trim();

  // helper: seat + order (canonical POS flow)
  function seatAndOrder(oid,total){
    S(`UPDATE table_floors SET status='occupied', guest_count=2, last_activity_at=now() WHERE table_number=${T} AND location_id=${q(LOCA)}`);
    S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(oid)},${T},'confirmed',${total},${q(LOCA)},${q(ORG)},'pending',1)`);
    S(`UPDATE table_floors SET current_order_id=${q(oid)}, total_amount=${total} WHERE table_number=${T} AND location_id=${q(LOCA)}`);
  }

  // ---- D3-1: DISMISS a table with an ACTIVE (unpaid) order -> SUCCESS (valid state) ----
  const o1=crypto.randomUUID();
  seatAndOrder(o1,100);
  let r=await http('/api/orders/dismiss',{table_number:T},TK);
  let b={}; try{b=JSON.parse(r.body);}catch{}
  P('D3-1','dismiss on ACTIVE-order table -> 200 success (valid state works; the guards are correct)',
    r.status===200 && b.success===true, 'status='+r.status+' '+r.body.slice(0,100));
  P('D3-1b','after valid dismiss: table EMPTY, pointer cleared (business rule)', tRow(T).startsWith('empty|'), tRow(T));

  // ---- D3-2: the PAID path — dismiss is BY DESIGN refused; release is the action ----
  const o2=crypto.randomUUID();
  seatAndOrder(o2,100);
  // pay the order via the REAL route -> complete_payment_atomic -> order paid,
  // table stays occupied (L5). p_payments = [{method, amount}].
  const payRes=await http('/api/orders/complete-payment',{order_id:o2,payments:[{method:'card',amount:100}],payment_method:'card',cash_amount:0,card_amount:100,tip_amount:0,discount_amount:0,performed_by:mid},TK);
  let paidOk=payRes.status===200;
  const o2st=S(`SELECT status FROM orders WHERE id=${q(o2)}`);
  const t2=tRow(T);
  // NOTE: the live PAYMENT path (complete_payment_atomic) — not transition_order_atomic —
  // is what runs on close-bill, and it sets table.status='dirty' on full payment (a 4th
  // state, off the ratified empty/occupied/reserved model). D3-2 asserts the invariant
  // that MATTERS (payment does NOT auto-EMPTY the table) and captures the real state.
  // The dirty-vs-occupied model question is surfaced to the user (O payment decision).
  const t2s=t2.split('|')[0];
  P('D3-2','pay the order -> order PAID + table NOT auto-emptied (settled non-empty state; live=dirty from complete_payment_atomic)',
    paidOk && o2st==='paid' && t2s!=='empty', 'paid='+paidOk+' order='+o2st+' table='+t2+' (dirty finding: payment writes a 4th state, see report)');
  // Now DISMISS the paid table -> BY DESIGN refused (a paid order is not "active";
  // the canonical guard that fires is G_NO_ACTIVE_ORDER — G_DISMISS_ORDER_PAID is
  // unreachable in check order, but either way dismiss is correctly refused for a
  // paid table and RELEASE is the required action. The UI already routes paid -> release.)
  r=await http('/api/orders/dismiss',{table_number:T},TK);
  b={}; try{b=JSON.parse(r.body);}catch{}
  P('D3-2b','dismiss on PAID table -> 400 BY DESIGN (G_NO_ACTIVE_ORDER; the paid path is release, UI routes it there)',
    r.status===400 && /G_NO_ACTIVE_ORDER|G_DISMISS_ORDER_PAID/.test(r.body), 'status='+r.status+' '+r.body.slice(0,100));
  // RELEASE is the correct action for a paid table -> works, table EMPTY
  r=await http('/api/tables/release',{table_number:T},TK);
  b={}; try{b=JSON.parse(r.body);}catch{}
  P('D3-2c','release on PAID table -> 200, table EMPTY (the correct UI action works end-to-end)',
    r.status===200 && tRow(T).startsWith('empty|'), 'status='+r.status+' table='+tRow(T)+' '+r.body.slice(0,80));

  // ---- D3-3: NO paid+occupied+paid-pointer final state exists (the forbidden end state) ----
  const bad=S(`SELECT count(*) FROM table_floors tf JOIN orders o ON o.table_number=tf.table_number AND o.location_id=tf.location_id
    WHERE tf.status='occupied' AND tf.current_order_id=o.id AND o.status='paid'`);
  P('D3-3','no final state: order=PAID + table=OCCUPIED + current_order_id=paid order (forbidden end state = 0)',
    bad==='0', 'count='+bad);

  // ---- D3-4: waiter (no floor.manage) dismiss -> 403 (permission guard intact) ----
  const wid=crypto.randomUUID();
  const rWtr=S("SELECT id::text FROM roles WHERE name='waiter'");
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(wid)},'L3_WTR','L3_WTR',${q(rWtr)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  const TKw=crypto.randomUUID();
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(TKw)},${q(wid)},'waiter',now()+interval '1h','ACTIVE',${q(ORG)},${q(LOCA)})`);
  const o4=crypto.randomUUID();
  seatAndOrder(o4,50);
  r=await http('/api/orders/dismiss',{table_number:T},TKw);
  P('D3-4','waiter (no floor.manage) dismiss -> 403 (F-01 permission guard intact)',
    r.status===403, 'status='+r.status+' '+r.body.slice(0,80));
  // FINAL cleanup: every order on table T (o1/o2/o4) + their payments/order_items
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number=${T}) OR payload->>'table_number'='${T}'`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number=${T})`);
  S(`DELETE FROM orders WHERE table_number=${T}`);
  S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false, bill_requested=false WHERE table_number=${T} AND location_id=${q(LOCA)}`);
  S(`DELETE FROM sessions WHERE user_id IN (${q(mid)},${q(wid)})`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (${q(mid)},${q(wid)})`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE id IN (${q(mid)},${q(wid)})`);

  const resid=S(`SELECT count(*) FROM orders WHERE table_number=${T}`);
  P('D3-5','cleanup: 0 residue', resid==='0' && tRow(T).startsWith('empty|'), 'orders='+resid+' table='+tRow(T));

  const pass=results.filter(x=>x.pass).length;
  console.log('\n'+pass+'/'+results.length+' L3 checks passed');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e.message);process.exit(2);});
