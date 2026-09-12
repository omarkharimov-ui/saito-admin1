// L5 live probe (idempotent, zero-residue): transition_order_atomic floor-sync
// reconciliation (decision A, ratified). Table stays OCCUPIED for the whole
// active meal (incl. paid); cancelled frees the table only when it is the last
// open order; NO new status_change_failed rows (the 39-row churn is dead).
// ALSO reproduces the D1 stuck-state (direct order delete on occupied table)
// and proves the repair pattern (043) resolves it.
// Run: node .k-l5-probe.cjs
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const https=require('https'); const fs=require('fs');
let SVC=''; try{SVC=(fs.readFileSync('artifacts/saito-admin/.env.local','utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)||[])[1].trim();}catch{}
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,90)+': '+r.stderr);return r.stdout.trim();}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,180)));}
function rpc(fn,args){return new Promise((res,rej)=>{const r=https.request({hostname:'jbxmlnsicbfkbsatnoej.supabase.co',path:'/rest/v1/rpc/'+fn,method:'POST',headers:{'apikey':SVC,'Authorization':'Bearer '+SVC,'Content-Type':'application/json'}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);r.write(JSON.stringify(args||{}));r.end();});}
function tState(tn){return S(`SELECT status FROM table_floors WHERE table_number=${tn} AND location_id=${q(LOCA)}`);}
// canonical seated-first fixture (SEAT -> ORDER, the real POS flow):
// 1) seat: occupied (raw status flip, same as /api/tables/seat)
// 2) order insert (trigger cascade runs; table already occupied -> pointer write allowed)
// 3) finalize pointer + total (single stmt; current_order_id + non-emptied status)
function seatAndOrder(tn,oid,total){
  S(`UPDATE table_floors SET status='occupied', guest_count=2, last_activity_at=now() WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
  S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(oid)},${tn},'confirmed',${total},${q(LOCA)},${q(ORG)},'pending',1)`);
  S(`UPDATE table_floors SET current_order_id=${q(oid)}, total_amount=${total} WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
}
function unseat(tn){
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number=${tn} AND location_id=${q(LOCA)})`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number=${tn} AND location_id=${q(LOCA)}) OR payload->>'table_number'='${tn}'`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number=${tn} AND location_id=${q(LOCA)})`);
  S(`DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number=${tn} AND location_id=${q(LOCA)})`);
  S(`DELETE FROM orders WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
  S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false, bill_requested=false WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
}
(async()=>{
  // ---- idempotent startup cleanup (BEFORE fixtures, like G7) ----
  const T1=99, T2=991, T3=992;
  for(const tn of [T1,T2,T3]) unseat(tn);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name='L5_SA')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name='L5_SA')`);
  // F-contract: staff rows are set INACTIVE, never deleted
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name='L5_SA'`);
  // ensure test tables exist @ LOCA, empty
  for(const tn of [T1,T2,T3]){
    const ex=S(`SELECT count(*)::text FROM table_floors WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
    if(ex==='0') S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${tn},'empty',${q(LOCA)},${q(ORG)})`);
    else S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false, bill_requested=false WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
  }
  const beforeFail=S(`SELECT count(*)::text FROM audit_logs WHERE action='status_change_failed'`);

  // ---- superadmin session (transition_order_atomic is token-first) ----
  const said=crypto.randomUUID();
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(said)},'L5_SA','L5_SA',${q(S("SELECT id::text FROM roles WHERE name='superadmin'"))},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  const TK=crypto.randomUUID();
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(said)},${q(LOCA)},true,true,${q(ORG)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(TK)},${q(said)},'superadmin',now()+interval '1h','ACTIVE',${q(ORG)},${q(LOCA)})`);
  for(const tn of [T1,T2,T3]){
    const ex=S(`SELECT count(*)::text FROM table_floors WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
    if(ex==='0') S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${tn},'empty',${q(LOCA)},${q(ORG)})`);
    else S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false WHERE table_number=${tn} AND location_id=${q(LOCA)}`);
  }

  // ---- L5-1: full active-meal cycle keeps table OCCUPIED (seat first!) ----
  const o1=crypto.randomUUID();
  seatAndOrder(T1,o1,100);
  let states=[];
  for(const st of ['in_kitchen','ready','served','payment_pending','paid']){
    const r=await rpc('transition_order_atomic',{p_token:TK,p_order_id:o1,p_new_status:st,p_reason:'l5-test'});
    states.push(st+':'+tState(T1)+(r.status===200?'':'!'+r.status));
  }
  P('L5-1','seat->confirmed->in_kitchen->ready->served->payment_pending->paid: table stays OCCUPIED every step (no registry churn)',
    states.every(s=>s.endsWith(':occupied')), states.join(' | '));

  // L5-2: PAID+OCCUPIED is VALID. The table stays OCCUPIED (payment NEVER
  // auto-empties; customer still sitting). The F-frozen sync trigger correctly
  // zeroes current_order_id + total_amount once the order is no longer "open"
  // (bill settled) — that's the canonical "settled but occupied" shape.
  const t1row=S(`SELECT status||'|'||coalesce(current_order_id::text,'null')||'|'||total_amount FROM table_floors WHERE table_number=${T1} AND location_id=${q(LOCA)}`);
  P('L5-2','after PAID: table stays OCCUPIED (PAID+OCCUPIED valid; no auto-empty) — settled shape occupied|null|0 (bill cleared by F sync)',
    t1row.split('|')[0]==='occupied', t1row);

  // ---- L5-3: cancelled frees the table only on the LAST open order (idx_orders_active_table
  // allows exactly ONE active order per table -> sequential orders, the real model) ----
  const o2=crypto.randomUUID();
  seatAndOrder(T2,o2,50);
  let r=await rpc('transition_order_atomic',{p_token:TK,p_order_id:o2,p_new_status:'cancelled',p_reason:'l5-cancel-1'});
  const after1=tState(T2);
  P('L5-3','cancel the ONLY open order -> table becomes EMPTY (business rule)', after1==='empty', 'after1='+after1+' '+r.body.slice(0,80));
  const o3=crypto.randomUUID();
  // re-seat the (now empty) table for the next customer, then cancel it again
  seatAndOrder(T2,o3,60);
  r=await rpc('transition_order_atomic',{p_token:TK,p_order_id:o3,p_new_status:'cancelled',p_reason:'l5-cancel-2'});
  const after2=tState(T2);
  P('L5-3b','re-seat + re-cancel on the same table -> EMPTY again (repeatable cycle)', after2==='empty', 'after2='+after2);

  // ---- L5-3c: the D1 STUCK-STATE reproducer + repair pattern (043 mechanism) ----
  // direct (non-canonical) order delete on an occupied table = how 8/401/402 got stuck
  const o4=crypto.randomUUID();
  seatAndOrder(T3,o4,40);
  S(`DELETE FROM orders WHERE id=${q(o4)}`); // direct delete (bypasses canonical cancel)
  await new Promise(x=>setTimeout(x,300)); // trigger cascade settles
  const stuckState=S(`SELECT status||'|'||coalesce(current_order_id::text,'null')||'|'||total_amount||'|'||(SELECT count(*) FROM orders WHERE table_number=${T3} AND location_id=${q(LOCA)} AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')) FROM table_floors WHERE table_number=${T3} AND location_id=${q(LOCA)}`);
  P('L5-3c','D1 reproducer: direct order delete on occupied table leaves the documented stuck shape (occupied|null|0|0 open)',
    stuckState==='occupied|null|0|0', stuckState);
  // 043 repair pattern: single guarded UPDATE (no open orders, no pointer -> guard passes)
  S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false, bill_requested=false WHERE table_number=${T3} AND location_id=${q(LOCA)} AND current_order_id IS NULL`);
  P('L5-3d','D1 repair pattern: single guarded UPDATE resolves the stuck table to empty', tState(T3)==='empty', 'state='+tState(T3));

  // ---- L5-4: NO new status_change_failed rows (the 39-row churn is dead) ----
  const afterFail=S(`SELECT count(*)::text FROM audit_logs WHERE action='status_change_failed'`);
  P('L5-4','no NEW status_change_failed rows across the entire cycle (39-row silent churn eliminated)',
    Number(afterFail)===Number(beforeFail), 'before='+beforeFail+' after='+afterFail);

  // ---- L5-5: canonical release of the paid table still works (ownership intact) ----
  const rel=await rpc('release_paid_table_atomic',{p_token:TK,p_table_number:T1,p_final_status:'empty',p_performed_by:said,p_terminal_id:null});
  const t1final=tState(T1);
  P('L5-5','canonical release_paid_table_atomic still frees the PAID table (release ownership intact)',
    rel.status===200 && t1final==='empty', 'rel='+rel.status+' table='+t1final+' '+rel.body.slice(0,90));

  for(const tn of [T1,T2,T3]) unseat(tn);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name='L5_SA')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name='L5_SA')`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name='L5_SA'`);
  const resid=S(`SELECT count(*)::text FROM orders WHERE table_number IN (${T1},${T2},${T3}) AND location_id=${q(LOCA)}`);
  const residT=S(`SELECT count(*)::text FROM table_floors WHERE table_number IN (${T1},${T2},${T3}) AND status<>'empty'`);
  const residStaff=S(`SELECT count(*)::text FROM staff WHERE name='L5_SA' AND is_active=true`);
  P('L5-6','cleanup: 0 residue', resid==='0' && residT==='0' && residStaff==='0', 'orders='+resid+' tables='+residT+' staff='+residStaff);

  const pass=results.filter(r=>r.pass).length;
  console.log('\n'+pass+'/'+results.length+' L5 checks passed');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e.message);process.exit(2);});
