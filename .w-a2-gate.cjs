// W-A2 GATE — add-to-check (D12 check_token) + D13 server-sourced QR prices
// + D16 incremental total (mirror of frozen add_item_atomic)
// + D17 pre-insert floor flip (empty/cleaning -> occupied; latent prod fix).
// Plan: W_A2_PLAN.md. Public QR flow (no staff token for create/add); one
// fixture manager session exists ONLY for the /api/orders/pay step.
//
// Crash self-heal: fixture ids persist in .w-a2-fixture.json (P-7 pattern) —
// a re-run after a crashed/killed run tears down the stale fixture first, so
// the gate is idempotent across runs. Teardown contract: F-04 (table_floors
// append-only -> archive), P-3 trusted flag for payment-ledger deletes, house
// staff neutralize (W-A1), loyalty chain before customer delete (W-A1).
// Run: node .w-a2-gate.cjs   (dev :3000, solo, pooler drained)
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOC_A='f1f830b3-cf15-47e3-a538-01abd8222c6d';
const FLOOR_ID='10000000-0000-4000-8000-000000000002';
const FIXSTATE='.w-a2-fixture.json';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim().split('\n')[0]||'',err:(r.stderr||'').trim()};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='w2gate_csrf';
function http(path,body,token,method){method=method||'POST';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));r.write(body!==undefined?JSON.stringify(body):'');r.end();});}
const transErr=o=>!o||o.status===0||/ERR |ECONNRESET|socket hang up|client-timeout/i.test(o.body||'');
async function httpR(path,body,token,method){let last;for(let i=0;i<4;i++){last=await http(path,body,token,method);if(!transErr(last))return last;await sleep(700*(i+1));}return last;}

let PASS=0,FAIL=0; const results=[];
function R(id,name,ok,ev,note){
  if(ok)PASS++;else FAIL++;
  results.push({id,name,ok,evidence:String(ev).slice(0,320)});
  console.log((ok?'  PASS        ':'!!! FAIL      ')+id+' '+name+(ok?'':'\n   -> '+String(ev).slice(0,400))+(note?'\n   NOTE: '+note:''));
}
const n=x=>Number(x).toFixed(2);
const state={};
const saveState=()=>fs.writeFileSync(FIXSTATE,JSON.stringify(state,null,2));
// Teardown by saved ids — the exact P-7/F-04/P-3/W-A1 contract sequence.
function teardown(st){
  const oids=[st.oA,st.oB].filter(Boolean).map(q).join(',');
  const TF=`table_number IN (${st.TAB},${st.TBB}) AND organization_id=${q(ORG)} AND location_id=${q(LOC_A)}`;
  const oidlist=oids||'NULL';
  const tx=Sx(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false);
    UPDATE table_floors SET current_order_id=NULL WHERE ${TF};
    DELETE FROM payment_idempotency_keys WHERE ${oids?`order_id IN (${oids})`:'1=0'} OR key LIKE 'w2:%';
    DELETE FROM order_payments WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM payments WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM outbox_events WHERE ${oids?`aggregate_id IN (${oids})`:'1=0'};
    DELETE FROM outbox_events WHERE aggregate_type='kds_ticket' AND payload->>'order_id' IN (${st.oA?`${q(st.oA)}`:''}${st.oA&&st.oB?',':''}${st.oB?`${q(st.oB)}`:''});
    DELETE FROM audit_logs WHERE ${oids?`record_id IN (${oids})`:'1=0'};
    DELETE FROM audit_logs_canonical WHERE ${oids?`entity_id IN (${oids})`:'1=0'};
    DELETE FROM operation_logs WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM order_events WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM cancelled_orders WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM kitchen_schedule WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM inventory_logs WHERE ${oids?`order_id IN (${oids})`:'1=0'} OR order_item_id IN (SELECT id FROM order_items WHERE ${oids?`order_id IN (${oids})`:'1=0'});
    DELETE FROM loyalty_order_points WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM order_items WHERE ${oids?`order_id IN (${oids})`:'1=0'};
    DELETE FROM orders WHERE ${oids?`id IN (${oids})`:'1=0'};
    ${st.custId?`DELETE FROM loyalty_transactions WHERE account_id IN (SELECT id FROM loyalty_accounts WHERE customer_id=${q(st.custId)});
    DELETE FROM loyalty_accounts WHERE customer_id=${q(st.custId)};
    DELETE FROM customers WHERE id=${q(st.custId)};`:'SELECT 1;'}
    DELETE FROM products WHERE id IN (${q(st.PROD0||'00000000-0000-0000-0000-000000000000')},${q(st.PROD1||'00000000-0000-0000-0000-000000000000')});
    UPDATE table_floors SET status='empty' WHERE ${TF};
    UPDATE table_floors SET is_archived=true, archived_at=now() WHERE ${TF};
    SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`);
  Sx(`UPDATE staff SET is_active=false,status='INACTIVE',pin_hash='' WHERE name='W2_MGR'`);
  Sx(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name='W2_MGR')`);
  Sx(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name='W2_MGR')`);
  return tx;
}
const residue=st=>Sx(`SELECT
  (SELECT count(*)::text FROM orders WHERE table_number IN (${st.TAB},${st.TBB}))||'/'||
  (SELECT count(*)::text FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${st.TAB},${st.TBB})))||'/'||
  (SELECT count(*)::text FROM staff WHERE name='W2_MGR' AND (is_active OR status='ACTIVE' OR pin_hash<>''))||'/'||
  (SELECT count(*)::text FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name='W2_MGR'))||'/'||
  (SELECT count(*)::text FROM customers WHERE id=${q(st.custId||'00000000-0000-0000-0000-000000000000')})||'/'||
  (SELECT count(*)::text FROM products WHERE id IN (${q(st.PROD0||'00000000-0000-0000-0000-000000000000')},${q(st.PROD1||'00000000-0000-0000-0000-000000000000')}))||'/'||
  (SELECT count(*)::text FROM table_floors WHERE table_number IN (${st.TAB},${st.TBB}) AND is_archived=false)`).out;

(async()=>{
try{
  // ── crash self-heal: tear down any fixture a crashed run left ───────────
  if(fs.existsSync(FIXSTATE)){
    const stale=JSON.parse(fs.readFileSync(FIXSTATE,'utf8'));
    console.log('W-A2: stale fixture state found — tearing down ('+stale.TAB+'/'+stale.TBB+')...');
    const tx=teardown(stale);
    console.log('  stale teardown: '+(tx.status===0?'ok':'ERR '+tx.err.slice(0,200))+' residue='+(residue(stale)||'query-err'));
    fs.unlinkSync(FIXSTATE);
  }

  // ── fixture ─────────────────────────────────────────────────────────────
  const MROLE=S(`SELECT id::text FROM roles WHERE name='manager'`);
  state.STAFF_ID=crypto.randomUUID(); state.TOK=crypto.randomUUID();
  state.PROD0=crypto.randomUUID(); state.PROD1=crypto.randomUUID();
  state.custId=null; state.oA=null; state.oB=null;
  const PHONE='11188889001';
  const freeBase=()=>{let b=1300;for(let t=0;t<200;t++){const c=Sx(`SELECT count(*)::text FROM table_floors WHERE table_number BETWEEN ${b} AND ${b+1}`).out;const o=Sx(`SELECT count(*)::text FROM orders WHERE table_number BETWEEN ${b} AND ${b+1} AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')`).out;if(c==='0'&&o==='0')return b;b+=16;}throw new Error('no free table base');};
  state.TBASE=freeBase(); state.TAB=state.TBASE; state.TBB=state.TBASE+1;
  const TAB=state.TAB, TBB=state.TBB, PROD0=state.PROD0, PROD1=state.PROD1;
  console.log(`W-A2 FIXTURE: tables ${TAB}/${TBB} @LOC_A, products ${PROD0.slice(0,8)}/${PROD1.slice(0,8)}`);
  const BASE=Sx(`SELECT (SELECT count(*) FROM orders WHERE status='refunded')::text||'/'||(SELECT count(*) FROM orders WHERE status='partially_refunded')||'/'||(SELECT count(*) FROM orders WHERE status='voided')||'/'||(SELECT count(*) FROM order_payments WHERE is_refund=true)||'/'||(SELECT count(*) FROM orders WHERE refund_amount>paid_amount)`).out;
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(state.STAFF_ID)},'W2_MGR','W2_MGR',${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES (${q(state.STAFF_ID)},${q(LOC_A)},true,true,${q(ORG)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(state.TOK)},${q(state.STAFF_ID)},'manager',now()+interval '24h','ACTIVE',${q(ORG)},${q(LOC_A)})`);
  S(`INSERT INTO products(id,name,price,cost_price,is_active) VALUES (${q(PROD0)},'W2_PROD0',100.00,NULL,true),(${q(PROD1)},'W2_PROD1',50.00,NULL,true)`);
  S(`INSERT INTO table_floors(id,table_number,floor_id,location_id,organization_id,status,current_order_id) VALUES (${q(crypto.randomUUID())},${TAB},${q(FLOOR_ID)},${q(LOC_A)},${q(ORG)},'empty',NULL),(${q(crypto.randomUUID())},${TBB},${q(FLOOR_ID)},${q(LOC_A)},${q(ORG)},'empty',NULL)`);
  saveState();
  await sleep(4000); // session validation settle

  // ── W2-01: create on EMPTY table -> 200 (D17 regression proof) + token ──
  const cA=await httpR('/api/orders/qr',{table_number:TAB,items:[{product_id:PROD0,quantity:2,unit_price:0.01}]});
  state.oA=cA.data&&cA.data.orderId; saveState();
  const oA=state.oA; const tokenA=cA.data&&cA.data.checkToken;
  const hashA=S(`SELECT coalesce(qr_check_token_hash,'-') FROM orders WHERE id=${q(oA||'00000000-0000-0000-0000-000000000000')}`);
  const floorA=Sx(`SELECT status||'/'||coalesce(current_order_id::text,'null') FROM table_floors WHERE table_number=${TAB} AND location_id=${q(LOC_A)}`).out;
  R('W2-01','create on EMPTY table -> 200 (D17 flip) + checkToken (64 hex) + hash stored + floor occupied w/ pointer', cA.status===200&&/^[0-9a-f]{64}$/.test(tokenA||'')&&hashA===crypto.createHash('sha256').update(tokenA).digest('hex')&&floorA==='occupied/'+oA, `status=${cA.status} oid=${oA} floor=${floorA} body=${(cA.body||'').slice(0,140)}`);

  // ── W2-02: D13 underpay-proof on CREATE path ────────────────────────────
  const itemA=Sx(`SELECT coalesce(unit_price::text,'-')||'/'||coalesce(total_price::text,'-') FROM order_items WHERE order_id=${q(oA)} AND product_id=${q(PROD0)}`).out;
  const totA=Sx(`SELECT coalesce(total_amount,-1)::text FROM orders WHERE id=${q(oA)}`).out;
  const ip=itemA.split('/');
  R('W2-02','D13 CREATE underpay-proof: client unit_price 0.01 -> DB price 100.00, total raw 200.00 (no VAT)', ip.length===2&&n(ip[0])==='100.00'&&n(ip[1])==='200.00'&&n(totA)==='200.00', `item=${itemA} total=${totA}`);

  // ── W2-03: add-to-active + D13 underpay-proof on ADD path + D16 total ───
  const KEY='w2:add:'+crypto.randomUUID();
  const oeBefore=S(`SELECT count(*)::text FROM order_events WHERE order_id=${q(oA)} AND event_type='item_added'`);
  const obxBefore=S(`SELECT count(*)::text FROM outbox_events WHERE aggregate_type='kds_ticket' AND payload->>'order_id'=${q(oA)}`);
  const verBefore=Sx(`SELECT version::text FROM orders WHERE id=${q(oA)}`).out;
  const a1=await httpR('/api/orders/qr/add',{table_number:TAB,check_token:tokenA,items:[{product_id:PROD1,quantity:3,unit_price:0.01}],idempotency_key:KEY});
  const itemB=Sx(`SELECT coalesce(unit_price::text,'-')||'/'||coalesce(total_price::text,'-')||'/'||coalesce(kitchen_status,'-')||'/'||coalesce(idempotency_key,'-') FROM order_items WHERE order_id=${q(oA)} AND product_id=${q(PROD1)}`).out;
  const totAfter=Sx(`SELECT coalesce(total_amount,-1)::text||':'||version::text FROM orders WHERE id=${q(oA)}`).out;
  const verAfterW3=totAfter.split(':')[1];
  R('W2-03','add -> 200, itemsAdded=1, total 350.00 (200+150, D16 incremental no-VAT), version +1, item at DB price 50.00', a1.status===200&&a1.data&&a1.data.itemsAdded===1&&n(a1.data.total)==='350.00'&&itemB==='50.00/150.00/pending/'+KEY+':0'&&totAfter==='350.00:'+(Number(verBefore)+1), `status=${a1.status} item=${itemB} tot=${totAfter} body=${(a1.body||'').slice(0,160)}`);
  const oeAfter=S(`SELECT count(*)::text FROM order_events WHERE order_id=${q(oA)} AND event_type='item_added'`);
  const obxAfter=S(`SELECT count(*)::text FROM outbox_events WHERE aggregate_type='kds_ticket' AND payload->>'order_id'=${q(oA)}`);
  R('W2-04','add spine: order_events item_added +1 and KDS outbox (kds_ticket) +>=1', Number(oeAfter)===Number(oeBefore)+1&&Number(obxAfter)>=Number(obxBefore)+1, `oe ${oeBefore}->${oeAfter}, kds ${obxBefore}->${obxAfter}`);

  // ── W2-05: idempotent replay ────────────────────────────────────────────
  const a2=await httpR('/api/orders/qr/add',{table_number:TAB,check_token:tokenA,items:[{product_id:PROD1,quantity:3,unit_price:0.01}],idempotency_key:KEY});
  const itemsCnt=S(`SELECT count(*)::text FROM order_items WHERE order_id=${q(oA)}`);
  const totR=Sx(`SELECT coalesce(total_amount,-1)::text||':'||version::text FROM orders WHERE id=${q(oA)}`).out;
  const oeR=S(`SELECT count(*)::text FROM order_events WHERE order_id=${q(oA)} AND event_type='item_added'`);
  R('W2-05','replay same key -> itemsAdded=0, total/version/events unchanged', a2.status===200&&a2.data&&a2.data.itemsAdded===0&&itemsCnt==='2'&&totR==='350.00:'+verAfterW3&&Number(oeR)===Number(oeAfter)&&Number(a2.data.total).toFixed(2)==='350.00', `status=${a2.status} items=${itemsCnt} tot=${totR} oe=${oeR}`);

  // ── W2-06/07: wrong token / wrong table -> 404, no mutation ─────────────
  const a3=await httpR('/api/orders/qr/add',{table_number:TAB,check_token:'0'.repeat(64),items:[{product_id:PROD1,quantity:1}]});
  const a4=await httpR('/api/orders/qr/add',{table_number:TBB,check_token:tokenA,items:[{product_id:PROD1,quantity:1}]});
  const itemsCnt2=S(`SELECT count(*)::text FROM order_items WHERE order_id=${q(oA)}`);
  R('W2-06','wrong token -> 404 "Check not found" (no existence leak)', a3.status===404&&(a3.data&&a3.data.error)==='Check not found'&&itemsCnt2==='2', `status=${a3.status} body=${(a3.body||'').slice(0,120)}`);
  R('W2-07','valid token + wrong table -> 404, no rows on table B', a4.status===404&&itemsCnt2==='2'&&S(`SELECT count(*)::text FROM orders WHERE table_number=${TBB}`)==='0', `status=${a4.status} items=${itemsCnt2}`);

  // ── W2-08: shape validation (route level, no DB write) ──────────────────
  const big=Array.from({length:21},()=>({product_id:PROD1,quantity:1}));
  const s1=await httpR('/api/orders/qr/add',{table_number:TAB,check_token:tokenA,items:big});
  const s2=await httpR('/api/orders/qr/add',{table_number:TAB,check_token:tokenA,items:[{product_id:PROD1,quantity:0}]});
  const s3=await httpR('/api/orders/qr/add',{table_number:TAB,check_token:tokenA,items:[{product_id:'nope',quantity:1}]});
  R('W2-08','shape: 21 items / qty 0 / bad uuid -> all 400', s1.status===400&&s2.status===400&&s3.status===400, `s=${s1.status}/${s2.status}/${s3.status}`);

  // ── W2-09: single active order per table (frozen G3 index intact) ───────
  R('W2-09','no 2nd order: exactly 1 order on table A after all adds', S(`SELECT count(*)::text FROM orders WHERE table_number=${TAB}`)==='1', '');

  // ── W2-10: pay the check (frozen pay path, fixture manager) ─────────────
  const PK='w2:pay:'+crypto.randomUUID();
  const pay=await httpR('/api/orders/pay',{order_id:oA,payment_method:'card',paid_amount:350,cash_amount:0,card_amount:350,tip_amount:0,discount_amount:0,idempotency_key:PK},state.TOK);
  // NOTE: to_char(numeric,'0.00') is broken in this pooler environment (echoes
  // '#.##'); round(x,2)::text renders correctly (verified live).
  const stA=Sx(`SELECT status||'/'||round(coalesce(paid_amount,-1),2)::text||'/'||(SELECT count(*)::text FROM order_payments WHERE order_id=${q(oA)} AND status='captured' AND is_refund=false) FROM orders WHERE id=${q(oA)}`).out;
  R('W2-10','pay 350 -> paid, paid_amount 350.00, exactly 1 captured op', pay.status===200&&stA==='paid/350.00/1', `pay=${pay.status} state=${stA} body=${(pay.body||'').slice(0,140)}`);

  // ── W2-11: add after paid -> 409, no mutation ───────────────────────────
  const a5=await httpR('/api/orders/qr/add',{table_number:TAB,check_token:tokenA,items:[{product_id:PROD1,quantity:1}]});
  const itemsCnt3=S(`SELECT count(*)::text FROM order_items WHERE order_id=${q(oA)}`);
  R('W2-11','add after paid -> 409 "This check is closed", items unchanged', a5.status===409&&(a5.data&&a5.data.error)==='This check is closed'&&itemsCnt3==='2', `status=${a5.status} body=${(a5.body||'').slice(0,120)}`);

  // ── W2-12: guest-linked order — add keeps customer unchanged ────────────
  const cB=await httpR('/api/orders/qr',{table_number:TBB,items:[{product_id:PROD0,quantity:1,unit_price:0.01}],customer_phone:PHONE});
  state.oB=cB.data&&cB.data.orderId; state.custId=cB.data&&cB.data.customer&&cB.data.customer.id; saveState();
  const oB=state.oB; const tokenB=cB.data&&cB.data.checkToken;
  const custRow=Sx(`SELECT coalesce(customer_id::text,'null')||'/'||coalesce(customer_name,'-')||'/'||coalesce(customer_phone,'-') FROM orders WHERE id=${q(oB||'00000000-0000-0000-0000-000000000000')}`).out;
  const KB='w2:add:'+crypto.randomUUID();
  const a6=await httpR('/api/orders/qr/add',{table_number:TBB,check_token:tokenB,items:[{product_id:PROD1,quantity:2,unit_price:0.01}],idempotency_key:KB});
  const custAfter=Sx(`SELECT coalesce(customer_id::text,'null')||'/'||coalesce(customer_name,'-')||'/'||coalesce(customer_phone,'-') FROM orders WHERE id=${q(oB||'00000000-0000-0000-0000-000000000000')}`).out;
  const totB=Sx(`SELECT coalesce(total_amount,-1)::text FROM orders WHERE id=${q(oB||'00000000-0000-0000-0000-000000000000')}`).out;
  const itemC=Sx(`SELECT count(*)::text||'/'||coalesce(min(unit_price)::text,'-') FROM order_items WHERE order_id=${q(oB||'00000000-0000-0000-0000-000000000000')}`).out;
  R('W2-12','guest create on EMPTY table -> linked (id+phone on order); add keeps customer_* unchanged; total 200.00', cB.status===200&&!!state.custId&&custRow===state.custId+'/'+custRow.split('/')[1]+'/'+PHONE&&custAfter===custRow&&a6.status===200&&n(totB)==='200.00'&&itemC==='2/50.00', `cust=${custRow} add=${a6.status} total=${totB} items=${itemC} body=${(cB.body||'').slice(0,140)}`);

  // ── W2-13: financial baseline invariants unchanged ──────────────────────
  const BASE2=Sx(`SELECT (SELECT count(*) FROM orders WHERE status='refunded')::text||'/'||(SELECT count(*) FROM orders WHERE status='partially_refunded')||'/'||(SELECT count(*) FROM orders WHERE status='voided')||'/'||(SELECT count(*) FROM order_payments WHERE is_refund=true)||'/'||(SELECT count(*) FROM orders WHERE refund_amount>paid_amount)`).out;
  R('W2-13','baseline invariants (refunded/partial/voided/refrows/overref) unchanged', BASE2===BASE, `${BASE} -> ${BASE2}`);

  // ── W2-14: teardown + zero-residue ──────────────────────────────────────
  const tx=teardown(state);
  const res=residue(state);
  R('W2-14','teardown zero-residue (orders/items/staff-active/sessions/customer/products/unarchived)', tx.status===0&&res==='0/0/0/0/0/0/0', `residue=${res||'query-err'} txerr=${tx.err.slice(0,200)}`);
  if(tx.status===0&&res==='0/0/0/0/0/0/0') fs.unlinkSync(FIXSTATE);

  console.log(`\nW-A2 GATE: PASS=${PASS} FAIL=${FAIL}`);
  fs.writeFileSync('.w-a2-result.json',JSON.stringify({pass:PASS,fail:FAIL,base:BASE,results},null,2));
  process.exit(FAIL>0?1:0);
}catch(e){
  console.error('GATE CRASH: '+e.message);
  console.error(e.stack&&e.stack.slice(0,800));
  try{ if(fs.existsSync(FIXSTATE)) console.error('fixture state kept for self-heal on re-run: '+FIXSTATE); }catch{}
  process.exit(2);
}
})();
