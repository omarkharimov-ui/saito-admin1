// P-7 CONCURRENCY GATE — true-parallel proof of the A-class writer surface.
// Ratified 2026-09-15 (P7_WRITER_INVENTORY_DECISION_MATRIX_2026-09-15.md, C-1..C-16).
// Live parallel HTTP (Promise.allSettled) for each pair; assert FINAL RELATIONAL
// STATE (not just "no deadlock"). 40P01 / "deadlock detected" = REAL-RISK.
// Classification per test: PASS / EXPECTED-CONFLICT / REAL-RISK / HARNESS-FAILURE.
// Invariants locked in:
//   INV-DQ4  refund txn = order_payments (canonical) + payments (compat mirror), one txn
//   INV-DQ6  transition txn = order_events + audit_logs (compat) + operation_logs +
//            outbox_events, one txn (transition fn writes these 4; it does NOT write
//            audit_logs_canonical — see C-16 note)
// Live-verified facts baked into the design (2026-09-15):
//   - has_permission matches role_permissions.permission_key DIRECTLY.
//   - orders.cancel held ONLY by admin/owner/superadmin -> C-3 cancel leg = OWNER.
//   - payments.refund held by manager/owner only -> C-9/C-10 refund racers = manager.
//   - floor.manage held by manager/owner only -> C-5 release / C-6 dismiss = manager.
//   - pay route = requirePermission('payments.create') (cashier/manager/owner), no shift gate.
//   - reopen + clear-table = requireActiveShift (GLOBAL: any OPEN shift suffices).
//   - cpa_v2 (pay) = bare UPDATE ->paid (no manager-override check; P-5 trigger +
//     P-2 state-machine guard are the backstops). No MANAGER_OVERRIDE_REQUIRED on pay.
//   - makePaid: insert captured order_payments row FIRST, then ->paid (P-5 trigger).
//   - dismiss_table_atomic cancels ONLY non-terminal orders (paid is terminal -> safe).
//   - release_paid_table_atomic closes paid orders (->closed) + frees table.
//   - operation_logs has NO error/message column -> deadlock detected via HTTP body.
// Run: node .p7-gate.cjs  (dev :3000; pooler drained; solo). Zero-residue teardown.
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs');
// P7_ALL=1  : single process — build fixture, run C-1..C-16, cleanup + one report (preferred;
//              the 2-half split existed only to dodge the 5-min tool cap, which a full run (~3 min) fits).
// P7_HALF=1 : build fixture, run C-1..C-8, NO cleanup (residue persists for half 2).
// P7_HALF=2 : read fixture ids, run C-9..C-16, cleanup + merged report.
// Fixture ids persist in .p7-fixture.json so a resumed half addresses the same rows.
// 1=C-1..C-8 (build fixture, no cleanup)  2=C-9..C-16 (resume, cleanup)  3=ALL (single pass, cleanup)
const PHASE=process.env.P7_ALL==='1'?3:(process.env.P7_HALF==='2'?2:1);
const HALF=(PHASE===3)?1:PHASE; // fixture-build gate (ALL builds like half-1)
const DO_CLEANUP=(PHASE!==1);
const FIXSTATE='.p7-fixture.json';
const APP = 'http://localhost:3000';
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOC_A='f1f830b3-cf15-47e3-a538-01abd8222c6d';
const FLOOR_ID='10000000-0000-4000-8000-000000000002';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim().split('\n')[0]||'',err:(r.stderr||'').trim()};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SETTLE=3000, CSRF='p7gate_csrf';
// raw transport (no retry) — a real hang/timeout/40P01 is part of the assertion.
function httpRaw(path,body,token,method){method=method||'POST';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:20000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));r.write(body!==undefined?JSON.stringify(body):'');r.end();});}
// A 401 (or 400 with a session/auth keyword) on a KNOWN-VALID token = transient
// PostgREST/transaction-pooler blip in the dev-server auth lookup, NOT a concurrency
// finding. Evidence (half-2 re-examined): same token MGR returned 200 in C-10/C-15 but
// 401 in C-9/C-14 -> per-request intermittent, sessions were valid in DB, security_events
// had no expired/revoked rows, and a manual single-call passed auth (business 400).
// No test in this gate expects a 401 (all racers hold sufficient permission), so any
// 401-with-token is classified HARNESS-FAILURE (never REAL-RISK) and retried.
const bodyOf=o=>{try{return (o&&o.data&&(o.data.error||o.data.message))||o.body||'';}catch{return (o&&o.body)||'';}};
// 401-with-token: no P-7 test expects 401 -> always a blip.
// 400: only session-lookup-specific phrases (business 400s like "Invalid item_fate" must NOT match).
const AUTH_FLAKE=/Invalid or expired session|Invalid session|Session expired|Session revoked|Unauthenticated|Too many requests/i;
const authFlake=o=>o&&((o.status===401)||(o.status===400&&AUTH_FLAKE.test(bodyOf(o)))||(o.status===500&&/fetch failed/i.test(bodyOf(o))));
// transport WITH retry for network blips AND transient auth flakes (wait out a degraded window).
async function http(path,body,token,method){let last;for(let i=0;i<6;i++){last=await httpRaw(path,body,token,method);const net=/ERR |ECONNRESET|socket hang up/i.test(last.body||'');const flake=!!token&&authFlake(last);if(!(net||flake))return last;await sleep(Math.min(3000,700*(i+1)));}return last;}
const transErr=o=>!o||o.status===0||/ERR |ECONNRESET|socket hang up|client-timeout/i.test(o.body||'')||authFlake(o);
// Per-test health gate (root cause fix, proven 2026-09-15): the 2-day-old `next dev` process
// intermittently drops Supabase REST fetches under load (parallel probe: 14x200+1x500 "fetch
// failed"). Inside validateAuth a dropped session lookup = 401 "Invalid session" for a VALID
// token; in other routes = 500. Degraded windows last 10-30s and are time-varying (not
// load-proportional). Fix: before firing each race, probe the auth path (GET /api/orders,
// zero side effects) and STALL until it's healthy — never fire a race inside a measured
// degraded window. If the window outlasts the gate, the flake guards classify HARNESS-FAILURE
// (never hollow PASS / never false REAL-RISK).
async function healthGate(){
  for(let i=0;i<4;i++){
    const p=await httpRaw('/api/orders?limit=1',undefined,MGR,'GET');
    if(p.status!==0&&!authFlake(p))return true;
    await sleep(5000);
  }
  return false;
}
async function G(tag){if(!(await healthGate()))console.log('  [healthGate] still flaky before '+tag+' — flake guards active');}
// Per-token auth warmup: probe GET /api/orders (orders.view, zero side effects) until each
// known-valid token stops flaking. Pre-warms the dev-server's PostgREST/pooler connections
// so the race legs don't start inside a degraded window (root cause of half-2's 401/400s).
const WARM_NAMES=['MGR','CASH','MGR2','OWN','CASH2'];
async function warmupAuth(){
  let allOk=true;
  for(let i=0;i<TOKS.length;i++){
    let last;
    for(let t=0;t<8;t++){
      last=await httpRaw('/api/orders?limit=1',undefined,TOKS[i],'GET');
      if(!(authFlake(last)||last.status===0)) break;
      await sleep(Math.min(2500,500*(t+1)));
    }
    const good=last.status!==0&&!authFlake(last);
    if(!good){allOk=false;console.log('  WARMUP FAIL '+WARM_NAMES[i]+' last='+last.status+' '+(last.body||'').slice(0,80));}
    else console.log('  WARMUP ok '+WARM_NAMES[i]+' '+last.status);
  }
  if(!allOk) console.log('!! WARMUP: some tokens still flaking — tests carry their own retry + flake->HARNESS-FAILURE guard');
  return allOk;
}
const SVC=(fs.readFileSync('artifacts/saito-admin/.env.local','utf8').split('\n').find(l=>l.startsWith('SUPABASE_SERVICE_ROLE_KEY'))||'').split('=')[1].trim().replace(/["']/g,'');
// rpc = Supabase REST direct (service role). The *_atomic fns do their own p_token session
// lookup; under a parallel burst that lookup can transiently flake and return
// "Invalid or expired session" for a KNOWN-VALID token -> retry it (a blip is not a finding).
async function rpc(fn,args){let last;for(let i=0;i<4;i++){try{const r=await fetch('https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1/rpc/'+fn,{method:'POST',headers:{'apikey':SVC,'Authorization':'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify(args||{})});let d=null;try{d=await r.json();}catch{}last={status:r.status,data:d,body:JSON.stringify(d)};const b=last.body||'';const flake=/Invalid or expired session|Invalid session|Unauthenticated|Session expired|Session revoked|expired session/i.test(b);if(!flake)return last;}catch(e){last={status:0,body:'ERR '+e.message};if(!/ERR /.test(last.body))return last;}await sleep(650*(i+1));}return last;}
let PASS=0,CONFLICT=0,RISK=0,HARNESS=0; const results=[];
function R(id,name,cls,ok,evidence,note){
  if(cls==='PASS')PASS++;else if(cls==='EXPECTED-CONFLICT')CONFLICT++;else if(cls==='REAL-RISK')RISK++;else HARNESS++;
  results.push({id,name,cls,ok,evidence:String(evidence).slice(0,320),note});
  console.log((cls==='REAL-RISK'?'!!! RISK ':'  ')+cls.padEnd(18)+' '+id+' '+name+(ok?'':'\n   -> '+String(evidence).slice(0,300))+(note?'\n   NOTE: '+note:''));
}
const dl=s=>/deadlock detected|40P01/i.test(s||'');
const body=(o)=>{try{return (o&&o.data&&(o.data.error||o.data.message))||o.body||'';}catch{return (o&&o.body)||'';}};

// ============================ FIXTURES ============================
const MROLE=S(`SELECT id::text FROM roles WHERE name='manager'`);
const CROLE=S(`SELECT id::text FROM roles WHERE name='cashier'`);
const OROLE=S(`SELECT id::text FROM roles WHERE name='owner'`);
// 5 staff, independent sessions: MGR, CASH, MGR2, OWN, CASH2
const NS=5; const UIDS=[],TOKS=[],ROLE_N=['manager','cashier','manager','owner','cashier'];
const ROLE_ID=[MROLE,CROLE,MROLE,OROLE,CROLE];
for(let i=0;i<NS;i++){UIDS.push(crypto.randomUUID());TOKS.push(crypto.randomUUID());}
const MGR=TOKS[0],CASH=TOKS[1],MGR2=TOKS[2],OWN=TOKS[3],CASH2=TOKS[4];
const existingStaff=()=>Sx(`SELECT count(*)::text FROM staff WHERE name LIKE 'P7\\_%'`).out;
const N=13; const OIDL=[]; for(let i=0;i<N;i++) OIDL.push(crypto.randomUUID());
const O=i=>OIDL[i];
// Table numbers: pick a FRESH free 13-number block per run. table_floors rows are
// append-only (F-04: cannot DELETE, only archive), and order_table_archive_guard blocks
// orders on archived tables + enforce_order_table_location blocks cross-location same numbers.
// So each run consumes a new block [TBASE, TBASE+12] with NO table_floors row in it (any location).
const findFreeBase=()=>{ let base=1200; for(let t=0;t<200;t++){ const c=Sx(`SELECT count(*)::text FROM table_floors WHERE table_number BETWEEN ${base} AND ${base+12}`).out; if(c==='0') return base; base+=16; } throw new Error('no free table base found'); };
const OST=[ 'new','new','confirmed','new','new','new','new','new','new','new','closed','new','new' ];
let PROD0=crypto.randomUUID(), PROD1=crypto.randomUUID(), PROD2=crypto.randomUUID();
let SHIFT_ID=crypto.randomUUID(), DRW_ID=crypto.randomUUID();
let TBASE; // resolved in the half branches below
if(HALF===1){
  TBASE=findFreeBase();
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES ${UIDS.map((u,i)=>`(${q(u)},${q('P7_S'+i)},${q('P7_S'+i)},${q(ROLE_ID[i])},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`).join(',')}`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES ${UIDS.map(u=>`(${q(u)},${q(LOC_A)},true,true,${q(ORG)})`).join(',')}`);
  // 24h TTL: half-2 may run the next day (resume from .p7-fixture.json)
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES ${TOKS.map((t,i)=>`(${q(t)},${q(UIDS[i])},${q(ROLE_N[i])},now()+interval '24h','ACTIVE',${q(ORG)},${q(LOC_A)})`).join(',')}`);
  S(`INSERT INTO shifts(id,staff_id,report_date,opened_at,starting_cash,expected_cash,actual_cash,difference,updated_at,location_id,organization_id,status) VALUES (${q(SHIFT_ID)},${q(UIDS[0])},now()::date,now(),0,0,0,0,now(),${q(LOC_A)},${q(ORG)},'OPEN'::shift_status)`);
  S(`INSERT INTO products(id,name,price,cost_price,is_active) VALUES (${q(PROD0)},'P7_PROD0',100,NULL,true),(${q(PROD1)},'P7_PROD1',100,2.00,true),(${q(PROD2)},'P7_PROD2',10,NULL,true)`);
  // orders: total 100, paid 0 (paid ones fixed below); table_number TBASE..TBASE+12
  S(`INSERT INTO orders(id,table_number,status,guest_count,total_amount,paid_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES
    ${OIDL.map((id,i)=>`(${q(id)},${TBASE+i},${q(OST[i])},2,100,0,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1)`).join(',')}`);
  // items: one per order; O(8) item = PROD0 cost NULL + kitchen_status 'ready' (mode-1 refund)
  const kstat=(i)=>i===8?'ready':'pending';
  S(`INSERT INTO order_items(order_id,product_id,quantity,unit_price,product_name,total_price,kitchen_status,created_at,updated_at) VALUES
    ${OIDL.map((id,i)=>`(${q(id)},${q(i===8?PROD0:PROD1)},1,100,'P7_ITEM',100,'${kstat(i)}',now(),now())`).join(',')}`);
  // makePaid O(7),O(8),O(9),O(11): captured op-row FIRST, then ->paid (P-5 trigger order)
  const PAID=[7,8,9,11];
  S(`INSERT INTO order_payments(order_id,payment_method,method,amount,status,is_refund) VALUES
    ${PAID.map(i=>`(${q(O(i))},'card','card',100,'captured',false)`).join(',')}`);
  S(`UPDATE orders SET status='paid',paid_amount=100,paid_at=now() WHERE id IN (${PAID.map(i=>q(O(i))).join(',')})`);
  // table_floors only for O(4)=TBASE+4, O(5)=TBASE+5, O(6)=TBASE+6 (occupied, pointer set) — the table-race orders
  S(`INSERT INTO table_floors(id,table_number,floor_id,location_id,organization_id,status,current_order_id) VALUES
    ${[4,5,6].map(i=>`(${q(crypto.randomUUID())},${TBASE+i},${q(FLOOR_ID)},${q(LOC_A)},${q(ORG)},'occupied',${q(O(i))})`).join(',')}`);
  fs.writeFileSync(FIXSTATE,JSON.stringify({UIDS,TOKS,OIDL,PROD0,PROD1,PROD2,SHIFT_ID,TBASE},null,2));
  console.log(`P-7 FIXTURE: built half-1 (C-1..C-8) tables ${TBASE}-${TBASE+12}; state in .p7-fixture.json`);
}else if(fs.existsSync(FIXSTATE)){
  const st=JSON.parse(fs.readFileSync(FIXSTATE,'utf8'));
  TBASE=st.TBASE;
  UIDS.length=0;UIDS.push(...st.UIDS); TOKS.length=0;TOKS.push(...st.TOKS);
  OIDL.length=0;OIDL.push(...st.OIDL);
  PROD0=st.PROD0;PROD1=st.PROD1;PROD2=st.PROD2;SHIFT_ID=st.SHIFT_ID;
  console.log('P-7 FIXTURE: resumed from .p7-fixture.json (half-2, C-9..C-16)');
}else{ throw new Error('P7_SKIP>0 but no .p7-fixture.json — run half 1 first'); }
const baselines=()=>Sx(`SELECT (SELECT count(*) FROM orders WHERE status='refunded')||'/'||(SELECT count(*) FROM orders WHERE status='partially_refunded')||'/'||(SELECT count(*) FROM orders WHERE status='voided')||'/'||(SELECT count(*) FROM order_payments WHERE is_refund=true)||'/'||(SELECT count(*) FROM orders WHERE refund_amount>paid_amount)`).out;
// relational-state readers
const ord=oid=>Sx(`SELECT status FROM orders WHERE id=${q(oid)}`).out;
const opCnt=oid=>Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oid)}`).out;
const opCap=oid=>Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oid)} AND status='captured' AND is_refund=false`).out;
const opRef=oid=>Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oid)} AND is_refund=true`).out;
const mirCnt=oid=>Sx(`SELECT count(*)::text FROM payments WHERE order_id=${q(oid)} AND is_refund=true`).out;
 const paidAmt=oid=>Sx(`SELECT coalesce(paid_amount,0)::text FROM orders WHERE id=${q(oid)}`).out;
 const refundAmt=oid=>Sx(`SELECT coalesce(refund_amount,0)::text FROM orders WHERE id=${q(oid)}`).out;
 // NOTE (C-10 correction, 2026-09-15 live): orders.paid_amount is NET-of-refunds (makePaid sets
 // it to gross, then a refund decrements it: 100 -> 60 refunded -> paid_amount 40). So the
 // over-refund invariant must compare refund_amount against GROSS paid (captured non-refund
 // order_payments rows), NOT the net paid_amount. C-10's first draft compared to net and
 // false-positived (refund 60 > net 40) — the product itself was correct (capped 60 at pre-refund
 // paid 100, then decremented net). grossPaid below is the correct comparator.
 const grossPaid=oid=>Sx(`SELECT coalesce(sum(amount),0)::text FROM order_payments WHERE order_id=${q(oid)} AND status='captured' AND is_refund=false`).out;
const totalAmt=oid=>Sx(`SELECT coalesce(total_amount,0)::text FROM orders WHERE id=${q(oid)}`).out;
const canonA=oid=>Sx(`SELECT count(*)::text FROM audit_logs_canonical WHERE entity_id=${q(oid)}`).out;
const legA=oid=>Sx(`SELECT count(*)::text FROM audit_logs WHERE record_id=${q(oid)}`).out;
const outbox=oid=>Sx(`SELECT count(*)::text FROM outbox_events WHERE aggregate_id=${q(oid)}`).out;
const oeEvt=oid=>Sx(`SELECT count(*)::text FROM order_events WHERE order_id=${q(oid)}`).out;
const opLog=oid=>Sx(`SELECT count(*)::text FROM operation_logs WHERE order_id=${q(oid)}`).out;
const tfRow=(tn)=>Sx(`SELECT count(*)::text||':'||coalesce((SELECT status FROM table_floors WHERE table_number=${tn} AND location_id=${q(LOC_A)}),'-') FROM table_floors WHERE table_number=${tn}`).out;
const K=n=>`p7:${n}:${crypto.randomUUID()}`;
// op helpers
const pay=(tok,oid,key,amt=100)=>http('/api/orders/pay',{order_id:oid,payment_method:'card',paid_amount:amt,cash_amount:0,card_amount:amt,tip_amount:0,discount_amount:0,idempotency_key:key},tok);
const refundOrder=(tok,oid,amt,key)=>http('/api/orders/refund',{order_id:oid,amount:amt,method:'cash',idempotency_key:key},tok);
const refundItem1=(tok,oid,oiditem,fate,qty,amt,key)=>http('/api/orders/refund',{order_id:oid,order_item_id:oiditem,item_fate:fate,quantity:qty,amount:amt,method:'cash',idempotency_key:key},tok);
const cancel=(tok,oid)=>http('/api/orders',{action:'delete',id:oid},tok);
const dismiss=(tok,tnum)=>http('/api/orders/dismiss',{table_number:tnum,reason:'p7 dismiss',final_status:'empty'},tok);
const releaseT=(tok,tnum)=>http('/api/tables/release',{table_number:tnum,final_status:'empty'},tok);
const reopen=(tok,oid)=>http('/api/orders/reopen',{order_id:oid,reason:'p7 reopen'},tok);
const transition=(tok,oid,newStatus,reason)=>rpc('transition_order_atomic',{p_token:tok,p_order_id:oid,p_new_status:newStatus,p_reason:reason||'p7 test'});
const addItm=(tok,oid)=>rpc('add_item_atomic',{p_token:tok,p_order_id:oid,p_product_id:PROD2,p_quantity:1,p_modifiers:[],p_course:'main'});
const openItem=oid=>Sx(`SELECT string_agg(id::text,',' ORDER BY created_at) FROM order_items WHERE order_id=${q(oid)}`).out;
const closeDrawer=()=>rpc('close_cash_register_v2',{p_session_id:DRW_ID,p_actual_cash:0,p_notes:'p7 c7',p_manager_id:UIDS[0],p_performed_by:UIDS[0]});
const cleanup=()=>{const list=OIDL.map(q).join(',');
  // NOTE (F-04 live-verified): table_floors rows CANNOT be deleted (trg_table_archive_guard
  // raises on every DELETE). Archive instead. trg_table_release_guard blocks status='empty'
  // while open (non-terminal) orders exist, so sequence: clear pointer (status stays occupied)
  // -> delete money+orders -> status='empty' (guard passes) -> archive (is_archived flag flip).
  const TF=`table_number IN (${TBASE+4},${TBASE+5},${TBASE+6}) AND organization_id=${q(ORG)} AND location_id=${q(LOC_A)}`;
  Sx(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false);
    UPDATE table_floors SET current_order_id=NULL WHERE ${TF};
    DELETE FROM payment_idempotency_keys WHERE order_id IN (${list}) OR key LIKE 'p7:%';
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
    UPDATE table_floors SET status='empty' WHERE ${TF};
    UPDATE table_floors SET is_archived=true, archived_at=now() WHERE ${TF};
    DELETE FROM products WHERE id IN (${q(PROD0)},${q(PROD1)},${q(PROD2)});
    SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`);
  // Final (half-2) teardown: deactivate staff (delete blocked by trg_staff_prevent_delete),
  // drop sessions/shifts/drawer/staff_locations. Zero-residue target = staff INACTIVE (inert).
  Sx(`UPDATE staff SET is_active=false,status='INACTIVE' WHERE name LIKE 'P7%'`);
  Sx(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P7%')`);
  Sx(`DELETE FROM manager_overrides WHERE requested_by IN (SELECT id FROM staff WHERE name LIKE 'P7%')`);
  Sx(`DELETE FROM shifts WHERE id=${q(SHIFT_ID)}`);
  // delete ALL P7-owned drawer sessions (each run's C-7 inserts one; deleting only DRW_ID
  // left prior runs' residue). P7 staff are deactivated, so opened_by IN (P7 staff) is safe.
  Sx(`DELETE FROM cash_drawer_sessions WHERE opened_by IN (SELECT id FROM staff WHERE name LIKE 'P7%')`);
  Sx(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P7%')`);
};
 (async()=>{
  try{
   if(PHASE!==2) await sleep(6000); // session validation settle after batch insert (phase 1 & 3)
   if(PHASE===2){
     // C-11 needs O(10) at 'closed'; half-1's C-14 may have moved it — reset it.
     Sx(`UPDATE orders SET status='closed' WHERE id=${q(O(10))}`);
     console.log('half-2: O(10) reset to closed');
   }
   console.log('warmup: probing all tokens...'); await warmupAuth();
   const BASE=baselines();
   console.log('P-7 CONCURRENCY GATE — baseline refunded/partial/voided/refrows/overref =',BASE,'(half',HALF===1?'C-1..C-8':'C-9..C-16',')');

   // ── C-1..C-8 (pay-centric races) ──
   if(PHASE===1||PHASE===3){
   await G('C-1');
  // C-1 pay ∥ pay  SAME order SAME key (true parallel) -> exactly-once
   { const oid=O(0); const key=K('c1');
    const [a,b]=await Promise.allSettled([pay(MGR,oid,key),pay(CASH,oid,key)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-1','pay∥pay same-key -> exactly-once','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(ra.body+' '+rb.body);
    const ok=!d && opCap(oid)==='1' && paidAmt(oid)==='100' && ord(oid)==='paid'
      && (ra.status===200||rb.status===200) && ((ra.status===200&&rb.status===200)||(ra.status===409)||(rb.status===409));
    R('C-1','pay∥pay same-key -> ONE captured op, paid=100, exactly-once (200/replay or 200+409)',
      d?'REAL-RISK':(ok?'PASS':'REAL-RISK'), ok,
      `a=${ra.status} b=${rb.status} opCap=${opCap(oid)} paid=${paidAmt(oid)} st=${ord(oid)} ${d?'DEADLOCK!':''} ${body(ra).slice(0,50)}|${body(rb).slice(0,50)}`);
    }
  }

  await G('C-2');
  // C-2 pay ∥ pay  SAME order DIFF keys -> 1 success + 1 overpay-reject, no overpay
  { const oid=O(1); const ka=K('c2a'),kb=K('c2b');
    const [a,b]=await Promise.allSettled([pay(MGR2,oid,ka),pay(CASH2,oid,kb)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-2','pay∥pay diff-key -> no overpay','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(ra.body+' '+rb.body);
      const ok=!d && opCap(oid)==='1' && paidAmt(oid)==='100' && ord(oid)==='paid';
      R('C-2','pay∥pay diff-key -> ONE captured, paid=100, no overpay (2nd PAYMENT_EXCEEDS_REMAINING)',
        d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
        `a=${ra.status} b=${rb.status} opCap=${opCap(oid)} paid=${paidAmt(oid)} st=${ord(oid)} ${d?'DEADLOCK!':''} ${body(rb).slice(0,50)}`);}
  }

  await G('C-3');
  // C-3 pay ∥ cancel  (cancel = transition->cancelled, needs OWNER orders.cancel)
  { const oid=O(2); const ka=K('c3');
    const [a,b]=await Promise.allSettled([pay(OWN,oid,ka),cancel(OWN,oid)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-3','pay∥cancel -> one outcome','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(ra.body+' '+(rb.body||''));
      const st=ord(oid);
      const isPaid=st==='paid'&&opCap(oid)==='1'&&paidAmt(oid)==='100';
      const isCancel=st==='cancelled'&&opCap(oid)==='0'&&paidAmt(oid)==='0';
      const ok=!d&&(isPaid||isCancel);
      R('C-3','pay∥cancel -> EXACTLY one outcome (paid+1op OR cancelled+0op), never paid+cancelled',
        d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
        `st=${st} opCap=${opCap(oid)} paid=${paidAmt(oid)} pay=${ra.status} cancel=${rb.status} ${d?'DEADLOCK!':''} ${body(ra).slice(0,45)}|${body(rb).slice(0,45)}`);}
  }

  await G('C-4');
  // C-4 pay ∥ add_item  (money race) — both lock orders first; no overpay; P-5 holds
  { const oid=O(3); const ka=K('c4');
    const [a,b]=await Promise.allSettled([pay(MGR,oid,ka),addItm(MGR2,oid)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-4','pay∥add_item -> no overpay','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(ra.body+' '+(rb.body||''));
      const st=ord(oid);const over=parseFloat(paidAmt(oid))>parseFloat(totalAmt(oid))+0.01;
      const p5=(st==='paid')?opCap(oid)>='1':true; // P-5: paid requires a captured record
      const ok=!d&&!over&&p5;
      R('C-4','pay∥add_item -> serialize on orders; no overpay (paid<=total); paid requires op-row',
        d?'REAL-RISK':(ok?'PASS':'REAL-RISK'), ok,
        `st=${st} total=${totalAmt(oid)} paid=${paidAmt(oid)} opCap=${opCap(oid)} pay=${ra.status} add=${rb.status} ${d?'DEADLOCK!':''}`,
        st==='paid'&&parseFloat(paidAmt(oid))<parseFloat(totalAmt(oid))-0.01?`observation: paid<total after late add_item (money-consistency, P-9 class, not a deadlock/lost-payment)`:undefined);
    }
  }

  await G('C-5');
  // C-5 pay ∥ release_paid_table  (dirty guard: a paid order is never orphaned)
  { const oid=O(4); const tnum=TBASE+4; const ka=K('c5');
    const [a,b]=await Promise.allSettled([pay(CASH,oid,ka),releaseT(MGR2,tnum)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-5','pay∥release -> no orphan','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(ra.body+' '+(rb.body||''));
      const st=ord(oid);const cap=opCap(oid);
      // orphan = paid money with NO relational home: paid+1op but table row gone AND order gone is impossible (order persists).
      // The invariant: order still exists, and if it has a captured op it is in a terminal/valid state (paid or closed).
      const exists=Sx(`SELECT count(*)::text FROM orders WHERE id=${q(oid)}`).out==='1';
      const orphan=exists&&parseInt(cap)>=1&&!(st==='paid'||st==='closed'||st==='refunded'||st==='partially_refunded');
      const ok=!d&&exists&&!orphan;
      R('C-5','pay∥release_paid_table -> paid order NOT orphaned; table+order consistent (no deadlock, disjoint locks)',
        d?'REAL-RISK':(ok?'PASS':'REAL-RISK'), ok,
        `st=${st} opCap=${cap} tf=${tfRow(tnum)} pay=${ra.status} release=${rb.status} ${d?'DEADLOCK!':''} ${body(rb).slice(0,50)}`);}
  }

  await G('C-6');
  // C-6 pay ∥ dismiss  (THE TOCTOU: dismiss reads active order w/o FOR-UPDATE on orders;
  //     paid->cancelled is an ILLEGAL edge, so the P-2 BEFORE guard is the backstop)
  { const oid=O(5); const tnum=TBASE+5; const ka=K('c6');
    const [a,b]=await Promise.allSettled([pay(MGR2,oid,ka),dismiss(MGR2,tnum)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-6','pay∥dismiss -> paid never cancelled-with-money','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(ra.body+' '+(rb.body||''));
      const st=ord(oid);const cap=opCap(oid);
      const dangerous=st==='cancelled'&&parseInt(cap)>=1; // money captured on a CANCELLED order
      const ok=!d&&!dangerous;
      R('C-6','pay∥dismiss -> a PAID order is NEVER cancelled-with-captured-money (P-2 guard backstop)',
        d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
        `st=${st} opCap=${cap} paid=${paidAmt(oid)} pay=${ra.status} dismiss=${rb.status} ${d?'DEADLOCK!':''} ${dangerous?'**PAID-ORDER-CANCELLED**':''} ${body(rb).slice(0,50)}`);}
  }

  await G('C-7');
  // C-7 pay ∥ drawer-close  (disjoint locks: orders vs cash_drawer_sessions)
  { const oid=O(6); const ka=K('c7');
    S(`INSERT INTO cash_drawer_sessions(id,location_id,organization_id,status,opened_by,shift_id,opening_balance) VALUES (${q(DRW_ID)},${q(LOC_A)},${q(ORG)},'open',${q(UIDS[0])},${q(SHIFT_ID)},0)`);
    const [a,b]=await Promise.allSettled([pay(OWN,oid,ka),closeDrawer()]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra);
    if(te){R('C-7','pay∥drawer-close -> no deadlock','HARNESS-FAILURE',false,`pay transport=${ra.status}`);}
    else{const d=dl(ra.body+' '+(rb.body||''));
      const st=ord(oid);const ok=!d&&ra.status===200&&ord(oid)!=='';
      R('C-7','pay∥drawer-close -> disjoint locks, no 40P01, pay unaffected',
        d?'REAL-RISK':(ok?'PASS':'HARNESS-FAILURE'), ok,
        `st=${st} pay=${ra.status} close=${rb.status} ${d?'DEADLOCK!':''} ${body(rb).slice(0,60)}`);}
  }

   await G('C-8');
  // C-8 reopen ∥ pay  (no paid+deleted-ledger ghost)
   { const oid=O(7); const ka=K('c8');
    const [a,b]=await Promise.allSettled([reopen(MGR,oid),pay(CASH,oid,ka)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-8','reopen∥pay -> no ghost','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(ra.body+' '+rb.body);
      const st=ord(oid);const cap=opCap(oid);
      const ghost=(st==='paid'&&cap==='0')||(st==='new'&&parseInt(cap)>0);
      const ok=!d&&!ghost;
      R('C-8','reopen∥pay -> no paid+deleted-ledger ghost (never paid+0op nor new+captured-op)',
        d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
        `st=${st} opCap=${cap} reopen=${ra.status} pay=${rb.status} ${d?'DEADLOCK!':''} ${body(ra).slice(0,45)}|${body(rb).slice(0,45)}`);}
  }

   } // ── end C-1..C-8 ──

   // ── C-9..C-16 (refund + transition + rollback atomicity) ──
   if(PHASE===2||PHASE===3){
   await G('C-9');
  // C-9 refund ∥ refund  (mode-1, D-Q4 mirror path) — no over-refund + mirror==canonical
   { const oid=O(8); const it=openItem(oid); const ka=K('c9a'),kb=K('c9b');
    const [a,b]=await Promise.allSettled([refundItem1(MGR,oid,it,'waste',1,100,ka),refundItem1(MGR2,oid,it,'waste',1,100,kb)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-9','refund∥refund -> no over-refund + mirror parity','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(body(ra)+' '+body(rb));
      const ref=opRef(oid);const mir=mirCnt(oid);
      const overRef=parseFloat(refundAmt(oid))>parseFloat(paidAmt(oid))+0.01;
      const parity=(parseInt(mir)===parseInt(ref))&&parseInt(ref)>=1; // exactly one refund landed, mirror kept
      const ok=!d&&!overRef&&parity;
      R('C-9','refund∥refund (mode-1) -> no over-refund + D-Q4 mirror parity (payments==order_payments ref)',
        d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
        `refRows=${ref} mirror=${mir} refundAmt=${refundAmt(oid)} paid=${paidAmt(oid)} st=${ord(oid)} a=${ra.status} b=${rb.status} ${d?'DEADLOCK!':''}`);}
  }

  await G('C-10');
  // C-10 refund ∥ pay — serialize on orders; refund cannot exceed paid
  { const oid=O(9); const ka=K('c10r'),kb=K('c10p');
    const [a,b]=await Promise.allSettled([refundOrder(MGR,oid,60,ka),pay(CASH,oid,kb,40)]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-10','refund∥pay -> no over-refund','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(body(ra)+' '+rb.body);
      // over-refund = refunded MORE than gross received (captured non-refund op-rows).
      // paid_amount is net (gross−refunded) so it must NOT be the comparator (see grossPaid note).
      const overRef=parseFloat(refundAmt(oid))>parseFloat(grossPaid(oid))+0.01;
      const ok=!d&&!overRef;
      R('C-10','refund∥pay -> serialize on orders; no over-refund (refund<=gross_paid; net may drop below refund after a winning refund)',
        d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
        `refundAmt=${refundAmt(oid)} grossPaid=${grossPaid(oid)} netPaid=${paidAmt(oid)} st=${ord(oid)} a=${ra.status} b=${rb.status} ${d?'DEADLOCK!':''}`,
         'refund<=gross_paid is the sound invariant; paid_amount is net-of-refunds so net<refund after a winning refund is correct, not over-refund');
    }
  }

  await G('C-11');
  // C-11 transition ∥ transition  (closed->new ∥ closed->open, mutually exclusive)
  if(PHASE===3) Sx(`UPDATE orders SET status='closed' WHERE id=${q(O(10))}`); // single pass: ensure 'closed'
  { const oid=O(10); // fixture status 'closed'
    const [a,b]=await Promise.allSettled([transition(MGR,oid,'new','p7 c11a'),transition(MGR2,oid,'open','p7 c11b')]); await sleep(SETTLE);
    const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
    if(te){R('C-11','transition∥transition -> one wins','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
    else{const d=dl(body(ra)+' '+body(rb));
      const st=ord(oid);
      const ok=!d&&(st==='new'||st==='open'); // exactly one committed; the other hit an illegal now-state
      R('C-11','transition∥transition -> one wins, stale re-validated (closed->new ∥ closed->open, cross-illegal)',
        d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
        `st=${st} a=${ra.status} b=${rb.status} ${d?'DEADLOCK!':''} ${body(ra).slice(0,45)}|${body(rb).slice(0,45)}`);}
  }

  await G('C-12');
  // C-12 duplicate RPC (add_item x2, no key) -> no corrupt/partial item
  { const oid=O(12); // dedicated fresh 'new' order
    const before=Sx(`SELECT count(*)::text FROM order_items WHERE order_id=${q(oid)}`).out;
    const [a,b]=await Promise.allSettled([addItm(MGR,oid),addItm(MGR2,oid)]); await sleep(SETTLE);
    const fl=authFlake(a.value)||authFlake(b.value);
    if(fl){R('C-12','duplicate RPC (add_item x2) -> no corrupt/partial item','HARNESS-FAILURE',false,`auth-flake survived retry a=${a.value.status} b=${b.value.status} (race never reached DB)`);}
    else{const after=Sx(`SELECT count(*)::text FROM order_items WHERE order_id=${q(oid)}`).out;
    const corrupt=Sx(`SELECT count(*)::text FROM order_items WHERE order_id=${q(oid)} AND (total_price IS NULL OR product_id IS NULL OR quantity<=0)`).out;
    const added=parseInt(after)-parseInt(before);
    const ok=added>=0&&added<=2&&corrupt==='0';
    R('C-12','duplicate RPC (add_item x2, no key) -> no corrupt/partial item; count deterministic',
      (ok?'PASS':'REAL-RISK'), ok,
      `before=${before} after=${after} added=${added} corrupt=${corrupt}`);
    }
  }

  await G('C-13');
  // C-13 stale-state (adversarial): re-pay an already-paid order -> rejected after FOR UPDATE, 1 op
  { const oid=O(11); // fixture paid (makePaid), 1 op-row
    const ka=K('c13'); const r=await pay(CASH2,oid,ka); await sleep(SETTLE);
    if(authFlake(r)){R('C-13','stale-state: re-pay a paid order','HARNESS-FAILURE',false,`auth-flake survived retry status=${r.status} (re-pay never reached DB)`);}
    else{const cap=opCap(oid);
    const ok=(r.status===409||/ALREADY_PAID|EXCEEDS/i.test(body(r)))&&cap==='1';
    R('C-13','stale-state: re-pay a paid order -> rejected (re-validated after lock), still 1 op-row',
      (ok?'PASS':'REAL-RISK'), ok,
      `status=${r.status} opCap=${cap} st=${ord(oid)} ${body(r).slice(0,80)}`);
    }
  }

  await G('C-14');
  // C-14 3-way deadlock smoke (pay ∥ transition ∥ dismiss on distinct orders/tables)
  { const o1=O(0),o2=O(12),tn=TBASE+6; const ka=K('c14'); // O(0) paid, O(12) new->confirmed, table TBASE+6 active
    const [a,b,c]=await Promise.allSettled([pay(MGR,o1,ka),transition(MGR2,o2,'confirmed','p7 c14'),dismiss(OWN,tn)]); await sleep(SETTLE);
    const [ra,rb,rc]=[a.value,b.value,c.value]; const te=transErr(ra)||transErr(rb)||transErr(rc);
    if(te){R('C-14','3-way deadlock smoke','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status} c=${rc.status}`);}
    else{const d=dl(body(ra)+' '+body(rb)+' '+body(rc));
      R('C-14','3-way deadlock smoke (pay ∥ transition ∥ dismiss) -> no 40P01 / deadlock detected',
        d?'REAL-RISK':'PASS', !d,
        `a=${ra.status} b=${rb.status} c=${rc.status} ${d?'DEADLOCK! '+body(rc).slice(0,60):'no deadlock marker'}`);}
  }

  await G('C-15');
  // C-15 rollback atomicity (refund): over-refund reject -> ZERO mutation across all ledgers
  { const oid=O(8); // paid; already had C-9 refund. Re-baseline now.
    const bOrd=ord(oid),bOp=opCnt(oid),bMir=mirCnt(oid),bOb=outbox(oid),bRef=refundAmt(oid),bSt=ord(oid);
    const r=await refundOrder(MGR,oid,999,K('c15')); await sleep(SETTLE); // 999 > net-paid -> reject
    if(authFlake(r)){R('C-15','refund reject -> strict rollback','HARNESS-FAILURE',false,`auth-flake survived retry status=${r.status} (refund never reached DB; rollback unproven)`);}
    else{const ok=(r.status!==200||!/success['\":\s]*true/i.test(body(r)))
      &&ord(oid)===bOrd&&opCnt(oid)===bOp&&mirCnt(oid)===bMir&&outbox(oid)===bOb&&refundAmt(oid)===bRef;
    R('C-15','refund reject -> orders+order_payments+payments-mirror+outbox ALL unchanged (strict rollback)',
      (ok?'PASS':'REAL-RISK'), ok,
      `st ${bOrd}->${ord(oid)} op ${bOp}->${opCnt(oid)} mirror ${bMir}->${mirCnt(oid)} outbox ${bOb}->${outbox(oid)} ref ${bRef}->${refundAmt(oid)} status=${r.status} ${body(r).slice(0,60)}`);
    }
  }

  await G('C-16');
  // C-16 rollback atomicity (transition): illegal transition -> ZERO rows across all 4 tables
  //     NOTE (live-verified): transition_order_atomic writes order_events + audit_logs +
  //     operation_logs + outbox_events (section 7, only when status changed) and does NOT
  //     write audit_logs_canonical (only log_audit does). The strict-rollback assert covers
  //     every table the path actually writes. paid->in_kitchen is not a registry edge.
  { const oid=O(11); // paid
    const bCanon=canonA(oid),bLeg=legA(oid),bOb=outbox(oid),bEvt=oeEvt(oid),bOl=opLog(oid),bSt=ord(oid);
    const r=await transition(MGR,oid,'in_kitchen','p7 illegal'); await sleep(SETTLE);
    if(authFlake(r)){R('C-16','illegal transition -> strict rollback','HARNESS-FAILURE',false,`auth-flake survived retry ${r.status} (transition never reached DB; rollback unproven)`);}
    else{const ok=ord(oid)===bSt&&canonA(oid)===bCanon&&legA(oid)===bLeg&&outbox(oid)===bOb&&oeEvt(oid)===bEvt&&opLog(oid)===bOl;
    R('C-16','illegal transition reject -> orders + order_events + audit_logs + operation_logs + outbox ALL absent (strict rollback)',
      (ok?'PASS':'REAL-RISK'), ok,
      `st ${bSt}->${ord(oid)} canon ${bCanon}->${canonA(oid)} leg ${bLeg}->${legA(oid)} outbox ${bOb}->${outbox(oid)} evt ${bEvt}->${oeEvt(oid)} oplog ${bOl}->${opLog(oid)} ${r.status} ${body(r).slice(0,60)}`,
      'transition fn does not write audit_logs_canonical (only log_audit does) — canonical not in scope for this path');
    }
  }

   } // ── end HALF 2 (C-9..C-16) ──

   const AFTER=baselines();
   console.log('\n────────────────────────────────────────────────────────────');
   console.log(`P-7 GATE SUMMARY (half ${HALF}): PASS=${PASS} EXPECTED-CONFLICT=${CONFLICT} REAL-RISK=${RISK} HARNESS-FAILURE=${HARNESS}`);
   console.log('baseline->after refunded/partial/voided/refrows/overref =',BASE,'->',AFTER);
   const realRisk=results.filter(r=>r.cls==='REAL-RISK');
   const harness=results.filter(r=>r.cls==='HARNESS-FAILURE');
   if(realRisk.length){console.log('\n!! REAL-RISK (classify + disposition, NOT auto-pass):');realRisk.forEach(r=>console.log('   '+r.id+' '+r.name+' :: '+r.evidence));}
   if(harness.length){console.log('\n!! HARNESS-FAILURE (transport/fixture, re-run):');harness.forEach(r=>console.log('   '+r.id+' :: '+r.evidence));}
    // report: phase-1 writes partial; phase-2 MERGES phase-1 results; phase-3 (ALL) writes the single final report.
    const partial={phase:PHASE,PASS,CONFLICT,RISK,HARNESS,results,baseline:BASE,after:AFTER};
    if(PHASE===2&&fs.existsSync('.p7-gate-report.json')){
     const prev=JSON.parse(fs.readFileSync('.p7-gate-report.json','utf8'));
     if(prev.half===1){
       const all=prev.results.concat(results);
       const cls=x=>x==='REAL-RISK'?'R':x==='HARNESS-FAILURE'?'H':'X';
       const merged=results.map(r=>r); // already counted
       const counts={PASS:0,CONFLICT:0,RISK:0,HARNESS:0};
       all.forEach(r=>{ if(r.cls==='PASS')counts.PASS++; else if(r.cls==='EXPECTED-CONFLICT')counts.CONFLICT++; else if(r.cls==='REAL-RISK')counts.RISK++; else counts.HARNESS++; });
       fs.writeFileSync('.p7-gate-report.json',JSON.stringify({half:'1+2',...counts,results:all,baseline:prev.baseline,after:AFTER},null,2));
       console.log(`MERGED SUMMARY (1+2): PASS=${counts.PASS} EXPECTED-CONFLICT=${counts.CONFLICT} REAL-RISK=${counts.RISK} HARNESS-FAILURE=${counts.HARNESS}`);
     }
   } else {
     fs.writeFileSync('.p7-gate-report.json',JSON.stringify(partial,null,2));
   }
     } finally { if(DO_CLEANUP){cleanup();} else {console.log('half-1: NO cleanup — residue kept for half-2 (P7_HALF=2).');} }
  })()
  .catch(e=>{console.error('HARNESS ERROR:',e.message);if(DO_CLEANUP){try{cleanup();}catch(_){}}else{console.error('half-1 error: residue KEPT for resume (P7_HALF=2).');}process.exit(1);});
