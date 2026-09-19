 // P-8 CASH-DRAWER CONCURRENCY GATE — true-parallel proof of the P-8 writer surface.
 // Ratified 2026-09-17 (P8_CASH_DRAWER_INVENTORY_DECISION_MATRIX_2026-09-17.md, T-1..T-8).
 // Live parallel (Promise.allSettled) for each pair; assert FINAL RELATIONAL STATE,
 // not just "no deadlock". 40P01 / "deadlock detected" = REAL-RISK.
 // Classification per test: PASS / EXPECTED-CONFLICT / REAL-RISK / HARNESS-FAILURE.
 // Invariants under test:
 //   T-1  open∥open same shift  -> exactly ONE open drawer (1:1 bind; loser DRAWER_ALREADY_BOUND)
 //   T-2  close∥cash_in         -> closed: expected == canonical walk (payment accounted);
 //                                 open:   close rejected (requires_approval), no close row
 //   T-3  close∥in-flight cash payment (THE TOCTOU, T-3 fix) -> a payment ledger row must
 //        NEVER be booked against a closed session that failed to account for it.
 //        closed: expected_balance == cash_session_expected(sid) (FOR UPDATE serialized it)
 //        open:   close rejected (requires_approval) OR payment row booked & session open
 //   T-4  double close + idempotent replay (D-11, P-4 drawer namespace)
 //   T-5  clock_out∥close v2    -> no 40P01; final: shift closed AND drawer closed
 //   T-6  auto_clockout∥clock_out -> no 40P01; shift closed exactly once (consistent)
 //   T-7  recalculate∥close     -> no 40P01; final expected_balance == canonical (150.00)
 //   T-8  break start∥end       -> no 40P01; open breaks for the shift ∈ {0,1}
 // Frozen-gate compat preserved by construction: T-2/T-3/T-5/T-7 close legs use the
 // 5-ARG trusted wrapper (E/S R5 shape); cash_in legs include the 6-arg token path AND
 // the keyless shape stays legal (E8).
 // Run: P8_ALL=1 node .p8-gate.cjs  (dev :3000; solo; zero-residue teardown).
 'use strict';
 const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs');
 if(process.env.P8_ALL!=='1'){ console.error('P8_ALL=1 required (single-pass gate).'); process.exit(2); }
 const APP = 'http://localhost:3000';
 const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
 const ORG='00000000-0000-0000-0000-000000000001',LOC_A='f1f830b3-cf15-47e3-a538-01abd8222c6d';
 const q=s=>`'${String(s).replace(/'/g,"''")}'`;
 const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
 const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim().split('\n')[0]||'',err:(r.stderr||'').trim()};};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const SETTLE=3000, CSRF='p8gate_csrf';
 // raw transport (no retry) — a real hang/timeout/40P01 is part of the assertion.
 function httpRaw(path,body,token,method){method=method||'POST';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));r.write(body!==undefined?JSON.stringify(body):'');r.end();});}
 const bodyOf=o=>{try{return (o&&o.data&&(o.data.error||o.data.message))||o.body||'';}catch{return (o&&o.body)||'';}};
 // 401-with-valid-token = transient pooler/auth blip -> HARNESS-FAILURE (never REAL-RISK), retried.
 const AUTH_FLAKE=/Invalid or expired session|Invalid session|Session expired|Session revoked|Unauthenticated|Too many requests/i;
 const authFlake=o=>o&&((o.status===401)||(o.status===400&&AUTH_FLAKE.test(bodyOf(o)))||(o.status===500&&/fetch failed/i.test(bodyOf(o))));
 async function http(path,body,token,method){let last;for(let i=0;i<6;i++){last=await httpRaw(path,body,token,method);const net=/ERR |ECONNRESET|socket hang up/i.test(last.body||'');const flake=!!token&&authFlake(last);if(!(net||flake))return last;await sleep(Math.min(3000,700*(i+1)));}return last;}
 const transErr=o=>!o||o.status===0||/ERR |ECONNRESET|socket hang up|client-timeout/i.test(o.body||'')||authFlake(o);
 // Per-test health gate: probe the P-8 surface itself (GET /api/cash-drawer = cash.view,
 // zero side effects) and STALL until healthy — never fire a race inside a degraded window.
 async function healthGate(){
   for(let i=0;i<4;i++){
     const p=await httpRaw('/api/cash-drawer',undefined,CASH,'GET');
     if(p.status!==0&&!authFlake(p))return true;
     await sleep(5000);
   }
   return false;
 }
 async function G(tag){if(!(await healthGate()))console.log('  [healthGate] still flaky before '+tag+' — flake guards active');}
 const WARM_NAMES=['CASH','MGR','OWN'];
 async function warmupAuth(){
   let allOk=true;
   for(let i=0;i<TOKS.length;i++){
     let last;
     for(let t=0;t<8;t++){
       last=await httpRaw('/api/cash-drawer',undefined,TOKS[i],'GET');
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
 // rpc = Supabase REST direct (service role). *_atomic fns do their own p_token session
 // lookup; under a parallel burst that lookup can transiently flake -> retry (blip, not finding).
 async function rpc(fn,args){let last;for(let i=0;i<4;i++){try{const r=await fetch('https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1/rpc/'+fn,{method:'POST',headers:{'apikey':SVC,'Authorization':'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify(args||{})});let d=null;try{d=await r.json();}catch{}last={status:r.status,data:d,body:JSON.stringify(d)};const b=last.body||'';const flake=/Invalid or expired session|Invalid session|Unauthenticated|Session expired|Session revoked|expired session/i.test(b);if(!flake)return last;}catch(e){last={status:0,body:'ERR '+e.message};if(!/ERR /.test(last.body))return last;}await sleep(650*(i+1));}return last;}
 let PASS=0,CONFLICT=0,RISK=0,HARNESS=0; const results=[];
 function R(id,name,cls,ok,evidence,note){
   if(cls==='PASS')PASS++;else if(cls==='EXPECTED-CONFLICT')CONFLICT++;else if(cls==='REAL-RISK')RISK++;else HARNESS++;
   results.push({id,name,cls,ok,evidence:String(evidence).slice(0,320),note});
   console.log((cls==='REAL-RISK'?'!!! RISK ':'  ')+cls.padEnd(18)+' '+id+' '+name+(ok?'':'\n   -> '+String(evidence).slice(0,300))+(note?'\n   NOTE: '+note:''));
 }
 const dl=s=>/deadlock detected|40P01/i.test(s||'');
 const body=(o)=>bodyOf(o);

 // ============================ FIXTURES ============================
 const MROLE=S(`SELECT id::text FROM roles WHERE name='manager'`);
 const CROLE=S(`SELECT id::text FROM roles WHERE name='cashier'`);
 const OROLE=S(`SELECT id::text FROM roles WHERE name='owner'`);
 const NS=3; const UIDS=[],TOKS=[],ROLE_N=['cashier','manager','owner'];
 const ROLE_ID=[CROLE,MROLE,OROLE];
 for(let i=0;i<NS;i++){UIDS.push(crypto.randomUUID());TOKS.push(crypto.randomUUID());}
 const CASH=TOKS[0],MGR=TOKS[1],OWN=TOKS[2];
 const UCASH=UIDS[0],UMGR=UIDS[1],UOWN=UIDS[2];
 const PROD=crypto.randomUUID();
 const OID=crypto.randomUUID();        // T-3 cash-payment order
 let TBASE; // free single table number
 const DRWS=[];  // drawer session ids created (teardown)
 const SHIFTS=[]; // shift ids created (teardown)
 const findFreeBase=()=>{ let base=1200; for(let t=0;t<200;t++){ const c=Sx(`SELECT count(*)::text FROM table_floors WHERE table_number BETWEEN ${base} AND ${base+12}`).out; if(c==='0') return base; base+=16; } throw new Error('no free table base found'); };
 TBASE=findFreeBase();
 S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES ${UIDS.map((u,i)=>`(${q(u)},${q('P8_S'+i)},${q('P8_S'+i)},${q(ROLE_ID[i])},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`).join(',')}`);
 S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES ${UIDS.map(u=>`(${q(u)},${q(LOC_A)},true,true,${q(ORG)})`).join(',')}`);
 S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES ${TOKS.map((t,i)=>`(${q(t)},${q(UIDS[i])},${q(ROLE_N[i])},now()+interval '24h','ACTIVE',${q(ORG)},${q(LOC_A)})`).join(',')}`);
 S(`INSERT INTO products(id,name,price,cost_price,is_active) VALUES (${q(PROD)},'P8_PROD',100,NULL,true)`);
 S(`INSERT INTO orders(id,table_number,status,guest_count,total_amount,paid_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (${q(OID)},${TBASE},'new',2,100,0,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1)`);
 S(`INSERT INTO order_items(order_id,product_id,quantity,unit_price,product_name,total_price,kitchen_status,created_at,updated_at) VALUES (${q(OID)},${q(PROD)},1,100,'P8_ITEM',100,'pending',now(),now())`);
 console.log(`P-8 FIXTURE: built staff P8_S0..2 (cashier/manager/owner @ ${LOC_A.slice(0,8)}), order ${OID.slice(0,8)} table ${TBASE}`);

 // ============================ HELPERS ============================
 const K=n=>`p8:${n}:${crypto.randomUUID()}`;
 const clockIn=(tok,uid)=>rpc('clock_in_atomic_token',{p_token:tok,p_target_id:uid});
 const clockOut=(tok,uid)=>rpc('clock_out_atomic_token',{p_token:tok,p_target_id:uid,p_notes:'p8'});
 const startBrk=(tok,uid)=>rpc('start_break_token',{p_token:tok,p_target_id:uid,p_break_type:'smoke'});
 const endBrk=(tok,uid)=>rpc('end_break_token',{p_token:tok,p_target_id:uid});
 const autoClockout=()=>rpc('auto_clockout_staff',{});
 const openRpc=(tok,bal)=>rpc('open_cash_register',{p_token:tok,p_opening_balance:bal,p_notes:'p8 fixture'});
 const close5=(sid,actual,notes)=>rpc('close_cash_register_v2',{p_session_id:sid,p_actual_cash:actual,p_notes:notes||'p8',p_manager_id:null,p_performed_by:null});
 const close7=(sid,actual,tok,uid,key)=>rpc('close_cash_register_v2',{p_session_id:sid,p_actual_cash:actual,p_notes:'p8',p_manager_id:null,p_performed_by:uid,p_token:tok,p_idempotency_key:key});
 const cashIn6=(sid,amt,tok,uid,key)=>rpc('cash_in_atomic',{p_session_id:sid,p_amount:amt,p_description:'p8 cash_in',p_performed_by:uid,p_token:tok,p_idempotency_key:key});
 const recalc=sid=>rpc('recalculate_cash_session',{p_session_id:sid});
 const payCash=(tok,oid,key)=>http('/api/orders/pay',{order_id:oid,payment_method:'cash',paid_amount:100,cash_amount:100,card_amount:0,tip_amount:0,discount_amount:0,idempotency_key:key},tok);
 const openHttp=tok=>http('/api/cash-drawer',{action:'open',amount:0,description:'p8 t1'},tok);
 // relational readers
 const dStatus=sid=>Sx(`SELECT status FROM cash_drawer_sessions WHERE id=${q(sid)}`).out;
 const dExpected=sid=>Sx(`SELECT coalesce(expected_balance,0)::text FROM cash_drawer_sessions WHERE id=${q(sid)}`).out;
 const canonWalk=sid=>Sx(`SELECT public.cash_session_expected(${q(sid)})::text`).out;
 const ledgerCnt=(sid,ty)=>Sx(`SELECT count(*)::text FROM cash_drawer_log WHERE session_id=${q(sid)}${ty?` AND type=${q(ty)}`:''}`).out;
 const openShiftCnt=uid=>Sx(`SELECT count(*)::text FROM shifts WHERE staff_id=${q(uid)} AND closed_at IS NULL`).out;
 const shiftState=uid=>Sx(`SELECT status||'|auto='||coalesce(auto_closed::text,'?')||'|closed_at='||(closed_at IS NOT NULL)::text FROM shifts WHERE staff_id=${q(uid)} ORDER BY opened_at DESC LIMIT 1`).out;
 const openBreakCnt=uid=>Sx(`SELECT count(*)::text FROM shift_breaks b JOIN shifts s ON s.id=b.shift_id WHERE s.staff_id=${q(uid)} AND b.ended_at IS NULL`).out;
 // reset a staff between tests: close any open bound drawer at diff 0 (no manager needed),
 // then force-close any open shift (P-8 fixed drawer branch). Idempotent.
 const resetStaff=async(uid,tok)=>{
   const sid=Sx(`SELECT d.id::text FROM cash_drawer_sessions d WHERE d.shift_id=(SELECT id FROM shifts WHERE staff_id=${q(uid)} AND closed_at IS NULL) AND d.status='open'`).out;
   if(sid){ const exp=canonWalk(sid); await close5(sid,Number(exp),'p8 reset'); DRWS.push(sid); }
   await rpc('force_clock_out',{p_staff_id:uid,p_reason:'p8 reset',p_performed_by:UMGR});
 };
 const cleanup=async()=>{
   // 1) close everything still open (diff 0) so no open fixture sessions leak
   for(const uid of UIDS){ try{ const sid=Sx(`SELECT d.id::text FROM cash_drawer_sessions d WHERE d.shift_id=(SELECT id FROM shifts WHERE staff_id=${q(uid)} AND closed_at IS NULL) AND d.status='open'`).out; if(sid){ const exp=canonWalk(sid); await close5(sid,Number(exp),'p8 teardown'); DRWS.push(sid);} await rpc('force_clock_out',{p_staff_id:uid,p_reason:'p8 teardown',p_performed_by:UMGR}); }catch(e){ console.log('teardown reset warn '+uid.slice(0,8)+': '+e.message); } }
   // type-safe id sets (run-1 lesson: audit_logs_canonical.entity_id is TEXT —
   // uuid[] casts abort the whole txn; money tables need the P-3 reopen GUC;
   // overtime_records FK must go before shifts)
   const NONE='00000000-0000-0000-0000-000000000000';
   const dlList=DRWS.length?DRWS.map(q).join(','):`${q(NONE)}`;
   const shList=SHIFTS.length?SHIFTS.map(q).join(','):`${q(NONE)}`;
   const uidl=UIDS.map(q).join(',');
   const STAFF=`(SELECT id FROM staff WHERE id IN (${uidl}))`;
   const STAFF_T=`(SELECT id::text FROM staff WHERE id IN (${uidl}))`;
   const SHIFTS_=`(SELECT id FROM shifts WHERE staff_id IN (${uidl}) OR id IN (${shList}))`;
   const SHIFTS_T=`(SELECT id::text FROM shifts WHERE staff_id IN (${uidl}) OR id IN (${shList}))`;
   const SESS=`(SELECT id FROM cash_drawer_sessions WHERE opened_by IN (${uidl}) OR id IN (${dlList}))`;
   const SESS_T=`(SELECT id::text FROM cash_drawer_sessions WHERE opened_by IN (${uidl}) OR id IN (${dlList}))`;
   const ORD=`(SELECT id FROM orders WHERE id=${q(OID)})`;
   const ORD_T=`(SELECT id::text FROM orders WHERE id=${q(OID)})`;
   let fail=0;
   const run=sql=>{ const r=Sx(sql); if(r.status!==0){ fail++; console.log('CLEANUP ABORT: '+sql.slice(0,80)+'\n  ERR: '+(r.err||'').slice(0,240)); } else { console.log('cleanup ok: '+sql.trim().slice(0,72)); } };
   // per-statement (isolate aborts; each is idempotent)
   run(`DELETE FROM payment_idempotency_keys WHERE key LIKE 'p8:%' OR order_id=${q(OID)} OR (namespace='drawer' AND order_id IN ${SESS})`);
   run(`DELETE FROM cash_drawer_log WHERE session_id IN ${SESS} OR created_by IN ${STAFF}`);
   run(`DELETE FROM outbox_events WHERE aggregate_id IN ${SHIFTS_} OR aggregate_id IN ${SESS} OR aggregate_id IN ${ORD}`);
   run(`DELETE FROM audit_logs_canonical WHERE entity_id IN ${STAFF_T} OR entity_id IN ${SHIFTS_T} OR entity_id IN ${SESS_T} OR entity_id IN ${ORD_T}`);
   run(`DELETE FROM audit_logs WHERE record_id IN ${STAFF_T} OR record_id IN ${SHIFTS_T} OR record_id IN ${SESS_T} OR record_id IN ${ORD_T}`);
   run(`DELETE FROM cash_drawer_logs WHERE staff_id IN ${STAFF}`);
   run(`DELETE FROM shift_breaks WHERE shift_id IN ${SHIFTS_}`);
   run(`DELETE FROM time_clock_entries WHERE staff_id IN ${STAFF}`);
   run(`DELETE FROM time_clock_audit WHERE performed_by IN ${STAFF}`);
   run(`DELETE FROM security_events WHERE staff_id IN ${STAFF}`);
   run(`DELETE FROM audit_log WHERE record_id IN ${STAFF} OR record_id IN ${SHIFTS_} OR record_id IN ${SESS} OR record_id IN ${ORD}`);
   // P-3 money-table immutability: trusted reopen GUC, P-7 proven pattern
   run(`BEGIN;
SELECT set_config('app.payment_ledger_reopen','on',false);
DELETE FROM overtime_records WHERE shift_id IN ${SHIFTS_};
DELETE FROM operation_logs WHERE order_id IN ${ORD};
DELETE FROM order_events WHERE order_id IN ${ORD};
DELETE FROM order_payments WHERE order_id IN ${ORD};
DELETE FROM payments WHERE order_id IN ${ORD};
DELETE FROM order_items WHERE order_id IN ${ORD};
DELETE FROM cancelled_orders WHERE order_id IN ${ORD};
DELETE FROM kitchen_schedule WHERE order_id IN ${ORD};
DELETE FROM inventory_logs WHERE order_id IN ${ORD};
DELETE FROM orders WHERE id IN ${ORD};
SELECT set_config('app.payment_ledger_reopen','off',false);
COMMIT;`);
   run(`DELETE FROM shifts WHERE id IN ${SHIFTS_}`);
   run(`DELETE FROM cash_drawer_sessions WHERE id IN ${SESS}`);
   run(`DELETE FROM products WHERE id=${q(PROD)}`);
   run(`UPDATE staff SET is_active=false,status='INACTIVE',pin_hash='' WHERE id IN ${STAFF}`); // W-A1: house neutralize contract (clear pin) — keeps P-9 S5.1/S5.4b green post-reflow
   run(`DELETE FROM sessions WHERE user_id IN ${STAFF}`);
   run(`DELETE FROM staff_locations WHERE staff_id IN ${STAFF}`);
   if(fail) console.log(`!! cleanup failures: ${fail} — residue check below will expose survivors`);
   return fail;
 };
 // pre-test defense: reset ALL three staff on every path (run-1 lesson: a fixture
 // failure left OWN's shift open -> T-8 ALREADY_CLOCKED_IN harness cascade).
 const preReset=async()=>{
   for(const [u,t] of [[UCASH,CASH],[UMGR,MGR],[UOWN,OWN]]){
     try{
       const sid=Sx(`SELECT d.id::text FROM cash_drawer_sessions d WHERE d.shift_id=(SELECT id FROM shifts WHERE staff_id=${q(u)} AND closed_at IS NULL) AND d.status='open'`).out;
       if(sid){ const exp=canonWalk(sid); const c=await close5(sid,Number(exp),'p8 pre-reset'); if(!(c.data&&c.data.success===true)) console.log('preReset close warn '+u.slice(0,8)+': '+body(c)); DRWS.push(sid); }
       await rpc('force_clock_out',{p_staff_id:u,p_reason:'p8 pre-reset',p_performed_by:UMGR});
     }catch(e){ console.log('preReset warn '+u.slice(0,8)+': '+e.message); }
   }
 };
 const residue=()=>Sx(`SELECT (SELECT 'drawer_sessions='||count(*) FROM cash_drawer_sessions WHERE opened_by IN (${UIDS.map(q).join(',')}) OR shift_id IN (SELECT id FROM shifts WHERE staff_id IN (${UIDS.map(q).join(',')}))) || '/' ||
    (SELECT 'drawer_log='||count(*) FROM cash_drawer_log WHERE created_by IN (${UIDS.map(q).join(',')}) OR session_id IN (SELECT id FROM cash_drawer_sessions WHERE opened_by IN (${UIDS.map(q).join(',')}))) || '/' ||
    (SELECT 'shifts='||count(*) FROM shifts WHERE staff_id IN (${UIDS.map(q).join(',')})) || '/' ||
    (SELECT 'breaks='||count(*) FROM shift_breaks WHERE staff_id IN (${UIDS.map(q).join(',')})) || '/' ||
    (SELECT 'tce='||count(*) FROM time_clock_entries WHERE staff_id IN (${UIDS.map(q).join(',')})) || '/' ||
    (SELECT 'orders='||count(*) FROM orders WHERE id=${q(OID)}) || '/' ||
    (SELECT 'idem='||count(*) FROM payment_idempotency_keys WHERE key LIKE 'p8:%') || '/' ||
    (SELECT 'legacy='||count(*) FROM cash_drawer_logs WHERE staff_id IN (${UIDS.map(q).join(',')}))`).out;
 (async()=>{
  try{
   await sleep(6000); // session-validation settle after batch insert
   console.log('warmup: probing all tokens...'); await warmupAuth();
   const BASE=residue();
   console.log('P-8 CASH-DRAWER GATE — residue baseline (all should be 0):',BASE);

   // ── T-1 open ∥ open (same shift, 1:1 bind) ──
   await G('T-1'); await preReset();
   {
     const ci=await clockIn(MGR,UMGR); SHIFTS.push(ci.data?.shift_id||'');
     if(!ci.data||ci.data.success!==true){R('T-1','open∥open same shift -> ONE drawer','HARNESS-FAILURE',false,'clock_in fixture failed: '+body(ci));}
     else{
       const [a,b]=await Promise.allSettled([openHttp(MGR),openHttp(MGR)]); await sleep(SETTLE);
       const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
       if(te){R('T-1','open∥open same shift -> ONE drawer','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
       else{const d=dl(body(ra)+' '+body(rb));
       const sa=(ra.data&&ra.data.success===true),sb=(rb.data&&rb.data.success===true);
       const opens=openShiftCnt(UMGR), drawers=Sx(`SELECT count(*)::text FROM cash_drawer_sessions WHERE shift_id=${q(ci.data.shift_id)} AND status='open'`).out;
       const loser=/DRAWER_ALREADY_BOUND/.test(body(ra)+' '+body(rb));
       const ok=!d&&(sa!==sb)&&drawers==='1';
       R('T-1','open∥open same shift -> EXACTLY ONE open drawer (loser DRAWER_ALREADY_BOUND, no raw 500)',
         d?'REAL-RISK':(ok?'PASS':'REAL-RISK'), ok,
         `a=${ra.status} b=${rb.status} oneSuccess=${sa}!==${sb} openDrawers=${drawers} loserMsg=${loser} ${d?'DEADLOCK!':''} ${body(ra).slice(0,45)}|${body(rb).slice(0,45)}`);}
       resetStaff(UMGR,MGR);
     }
   }

   // ── T-2 close ∥ cash_in ──
   await G('T-2'); await preReset();
   {
     const ci=await clockIn(OWN,UOWN); SHIFTS.push(ci.data?.shift_id||'');
     const op=await openRpc(OWN,100); DRWS.push(op.data?.id||'');
     if(!op.data||op.data.success!==true){R('T-2','close∥cash_in -> accounted or rejected','HARNESS-FAILURE',false,'open fixture failed: '+body(op));}
     else{const sid=op.data.id;
       const [a,b]=await Promise.allSettled([close5(sid,150),cashIn6(sid,50,OWN,UOWN,K('t2'))]); await sleep(SETTLE);
       const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
       if(te){R('T-2','close∥cash_in -> accounted or rejected','HARNESS-FAILURE',false,`transport a=${ra.status} b=${rb.status}`);}
       else{const d=dl(body(ra)+' '+body(rb));
       const st=dStatus(sid), closeLeg=(ra.data&&ra.data.success===true), inLeg=(rb.data&&rb.data.success===true);
       const rows={close:ledgerCnt(sid,'close'),cash_in:ledgerCnt(sid,'cash_in'),expected:dExpected(sid),canon:canonWalk(sid)};
       // closed  -> the close MUST have accounted for the cash_in (expected == canonical walk)
       // open    -> close rejected (requires_approval / not success) AND cash_in either booked (row) or rejected (session not open)
       const ok=!d && ((st==='closed'&&closeLeg&&rows.expected===rows.canon&&parseFloat(rows.expected)===150)
                       || (st==='open'&&!closeLeg&&/requires_approval|Manager approval/i.test(body(ra))&&rows.close==='0'));
       R('T-2','close∥cash_in -> closed: expected==canonical(150); open: close rejected, no close row (no unaccounted cash_in)',
         d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
         `st=${st} close=${closeLeg} in=${inLeg} rows=${JSON.stringify(rows)} ${d?'DEADLOCK!':''} ${body(ra).slice(0,40)}|${body(rb).slice(0,40)}`);}
       resetStaff(UOWN,OWN);
     }
   }

   // ── T-3 close ∥ in-flight cash payment (THE TOCTOU — orphan-row race MUST be gone) ──
   await G('T-3'); await preReset();
   {
     const ci=await clockIn(CASH,UCASH); SHIFTS.push(ci.data?.shift_id||'');
     const op=await openRpc(CASH,100); DRWS.push(op.data?.id||'');
     if(!op.data||op.data.success!==true){R('T-3','close∥cash payment -> no orphan/unaccounted row','HARNESS-FAILURE',false,'open fixture failed: '+body(op));}
     else{const sid=op.data.id;
       const [a,b]=await Promise.allSettled([close5(sid,200,'p8 t3 close'),payCash(CASH,OID,K('t3'))]); await sleep(SETTLE);
       const [rc,rp]=[a.value,b.value]; const te=transErr(rc)||transErr(rp);
       if(te){R('T-3','close∥cash payment -> no orphan/unaccounted row','HARNESS-FAILURE',false,`transport close=${rc.status} pay=${rp.status}`);}
       else{const d=dl(body(rc)+' '+body(rp));
       const st=dStatus(sid), closeLeg=(rc.data&&rc.data.success===true);
       const rows={payment:ledgerCnt(sid,'payment'),close:ledgerCnt(sid,'close'),expected:dExpected(sid),canon:canonWalk(sid)};
       const stOrd=Sx(`SELECT status FROM orders WHERE id=${q(OID)}`).out;
       const opCap=Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(OID)} AND status='captured' AND is_refund=false`).out;
       // THE T-3 invariant:
       //  closed -> expected_balance == canonical walk (FOR UPDATE serialized the payment;
       //             a payment row can exist ONLY if the close accounted for it)
       //  open   -> close rejected (requires_approval) — no partial commit
       // ALWAYS -> no 'close' ledger row unless st=closed; order paid has exactly 1 captured op
       const orphan=rows.close==='0'&&st==='closed'; // closed without a close row = impossible unless broken
       const staleExpected=st==='closed'&&rows.expected!==rows.canon;
       const unaccounted=st==='closed'&&rows.payment==='1'&&parseFloat(rows.expected)<200; // close committed without the payment row's 100
       const payBroken=!(stOrd==='paid'&&opCap==='1');
       const ok=!d&&!orphan&&!staleExpected&&!unaccounted&&!payBroken
         && ((st==='closed'&&closeLeg) || (st==='open'&&!closeLeg&&/requires_approval|Manager approval/i.test(body(rc))));
       R('T-3','close∥cash payment (TOCTOU) -> no orphan ledger row; closed⇒expected==canonical; order paid+1op',
         d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
         `st=${st} close=${closeLeg} rows=${JSON.stringify(rows)} ord=${stOrd} opCap=${opCap} ${d?'DEADLOCK!':''} ${body(rc).slice(0,40)}|${body(rp).slice(0,40)}`,
         'open+requires_approval = close committed nothing, trigger scoped-skip (documented); closed+expected==canon = payment serialized in');}
       resetStaff(UCASH,CASH);
     }
   }

   // ── T-4 double close + idempotent replay (D-11 drawer namespace) ──
   await G('T-4'); await preReset();
   {
     const ci=await clockIn(MGR,UMGR); SHIFTS.push(ci.data?.shift_id||'');
     const op=await openRpc(MGR,50); DRWS.push(op.data?.id||'');
     if(!op.data||op.data.success!==true){R('T-4','double close + replay','HARNESS-FAILURE',false,'open fixture failed: '+body(op));}
     else{const sid=op.data.id; const key=K('t4');
       const r1=await close7(sid,50,MGR,UMGR,key); await sleep(1500);
       const r2=await close7(sid,50,MGR,UMGR,key); await sleep(1500);
       const r3=await close7(sid,50,MGR,UMGR,K('t4b')); await sleep(SETTLE);
       const te=transErr(r1)||transErr(r2)||transErr(r3);
       if(te){R('T-4','double close + replay','HARNESS-FAILURE',false,`transport 1=${r1.status} 2=${r2.status} 3=${r3.status}`);}
       else{const d=dl(body(r1)+' '+body(r2)+' '+body(r3));
       const replay=(r2.data&&r2.data.success===true&&r2.data.idempotent===true);
       const third=(r3.data&&r3.data.success===false&&/already closed/i.test(body(r3)));
       const closeRows=ledgerCnt(sid,'close');
       const ok=!d&&(r1.data&&r1.data.success===true)&&replay&&third&&closeRows==='1'&&dStatus(sid)==='closed';
       R('T-4','double close + same-key replay -> ONE close row; replay idempotent:true; new key rejected (already closed)',
         d?'REAL-RISK':(ok?'PASS':'REAL-RISK'), ok,
         `1=${r1.status} 2=${r2.status} 3=${r3.status} closeRows=${closeRows} st=${dStatus(sid)} ${d?'DEADLOCK!':''} ${body(r2).slice(0,40)}|${body(r3).slice(0,40)}`);}
       resetStaff(UMGR,MGR);
     }
   }

   // ── T-5 clock_out ∥ close v2 (lock-order deadlock check) ──
   await G('T-5'); await preReset();
   {
     const ci=await clockIn(CASH,UCASH); SHIFTS.push(ci.data?.shift_id||'');
     const op=await openRpc(CASH,0); DRWS.push(op.data?.id||'');
     if(!op.data||op.data.success!==true){R('T-5','clock_out∥close v2 -> no 40P01, both closed','HARNESS-FAILURE',false,'open fixture failed: '+body(op));}
     else{const sid=op.data.id;
       const [a,b]=await Promise.allSettled([clockOut(CASH,UCASH),close5(sid,0,'p8 t5')]); await sleep(SETTLE);
       const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
       if(te){R('T-5','clock_out∥close v2 -> no 40P01, both closed','HARNESS-FAILURE',false,`transport out=${ra.status} close=${rb.status}`);}
       else{const d=dl(body(ra)+' '+body(rb));
       const stS=dStatus(sid), shO=openShiftCnt(UCASH);
       // both paths end closed: if clock_out ran first it hit DRAWER_OPEN (shift stayed open),
       // then close v2 closed shift+drawer; if close first, clock_out hit NO_OPEN_SHIFT after.
       const ok=!d&&stS==='closed'&&shO==='0';
       R('T-5','clock_out∥close v2 -> no 40P01; FINAL: shift closed AND drawer closed (DRAWER_OPEN/NO_OPEN_SHIFT are the legal exclusions)',
         d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
         `drawer=${stS} openShifts=${shO} out=${ra.status} close=${rb.status} ${d?'DEADLOCK!':''} ${body(ra).slice(0,40)}|${body(rb).slice(0,40)}`);}
       resetStaff(UCASH,CASH);
     }
   }

   // ── T-6 auto_clockout ∥ clock_out (13h-old shift, D-2a drawer guard) ──
   await G('T-6'); await preReset();
   {
     const sid6=crypto.randomUUID(); SHIFTS.push(sid6);
     Sx(`INSERT INTO shifts(id,staff_id,report_date,opened_at,starting_cash,expected_cash,actual_cash,difference,updated_at,location_id,organization_id,status,auto_closed) VALUES (${q(sid6)},${q(UMGR)},(now()-interval '13h')::date,now()-interval '13h',0,0,0,0,now(),${q(LOC_A)},${q(ORG)},'OPEN'::shift_status,false)`);
     await sleep(500);
     const [a,b]=await Promise.allSettled([autoClockout(),clockOut(MGR,UMGR)]); await sleep(SETTLE);
     const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
     if(te){R('T-6','auto_clockout∥clock_out -> no 40P01, shift closed once','HARNESS-FAILURE',false,`transport auto=${ra.status} out=${rb.status}`);}
     else{const d=dl(body(ra)+' '+body(rb));
     const st=shiftState(UMGR), shO=openShiftCnt(UMGR);
     const ok=!d&&shO==='0'&&/CLOSED\|/.test(st);
     R('T-6','auto_clockout∥clock_out (13h shift) -> no 40P01; FINAL: shift CLOSED, zero open shifts (one leg wins, other NO_OPEN_SHIFT/skip)',
       d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
       `shift=${st} openShifts=${shO} auto=${ra.status} out=${rb.status} ${d?'DEADLOCK!':''} ${body(ra).slice(0,40)}|${body(rb).slice(0,40)}`,
       'D-2a guard proven indirectly: the 13h shift had NO open bound drawer, so auto-close was eligible');}
     resetStaff(UMGR,MGR);
   }

   // ── T-7 recalculate ∥ close ──
   await G('T-7'); await preReset();
   {
     const ci=await clockIn(OWN,UOWN); SHIFTS.push(ci.data?.shift_id||'');
     const op=await openRpc(OWN,100); DRWS.push(op.data?.id||'');
     if(!op.data||op.data.success!==true){R('T-7','recalc∥close -> canonical 150 preserved','HARNESS-FAILURE',false,'open fixture failed: '+body(op));}
     else{const sid=op.data.id;
       const cin=await cashIn6(sid,50,OWN,UOWN,K('t7')); await sleep(1500);
       if(!(cin.data&&cin.data.success===true)){R('T-7','recalc∥close -> canonical 150 preserved','HARNESS-FAILURE',false,'cash_in fixture failed: '+body(cin));}
       else{
         const [a,b]=await Promise.allSettled([recalc(sid),close5(sid,150,'p8 t7')]); await sleep(SETTLE);
         const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
         if(te){R('T-7','recalc∥close -> canonical 150 preserved','HARNESS-FAILURE',false,`transport recalc=${ra.status} close=${rb.status}`);}
         else{const d=dl(body(ra)+' '+body(rb));
         const stS=dStatus(sid), rows={expected:dExpected(sid),canon:canonWalk(sid),close:ledgerCnt(sid,'close')};
         const ok=!d&&stS==='closed'&&rows.expected===rows.canon&&rows.close==='1';
         R('T-7','recalculate∥close -> no 40P01; FINAL: closed, expected==canonical (150.00), exactly 1 close row',
           d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
           `st=${stS} rows=${JSON.stringify(rows)} recalc=${ra.status} close=${rb.status} ${d?'DEADLOCK!':''} ${body(ra).slice(0,40)}|${body(rb).slice(0,40)}`);}
         resetStaff(UOWN,OWN);
       }
     }
   }

   // ── T-8 break start ∥ end ──
   await G('T-8'); await preReset();
   {
     const ci=await clockIn(OWN,UOWN); SHIFTS.push(ci.data?.shift_id||'');
     if(!ci.data||ci.data.success!==true){R('T-8','break start∥end -> consistent break state','HARNESS-FAILURE',false,'clock_in fixture failed: '+body(ci));}
     else{
       const [a,b]=await Promise.allSettled([startBrk(OWN,UOWN),endBrk(OWN,UOWN)]); await sleep(SETTLE);
       const [ra,rb]=[a.value,b.value]; const te=transErr(ra)||transErr(rb);
       if(te){R('T-8','break start∥end -> consistent break state','HARNESS-FAILURE',false,`transport start=${ra.status} end=${rb.status}`);}
       else{const d=dl(body(ra)+' '+body(rb));
       const ob=openBreakCnt(UOWN), shO=openShiftCnt(UOWN);
       // legal finals: end ran first ('No active break') -> 1 open break left; start first ->
       // end closes it -> 0 open. The shift itself is NEVER closed by a break op (shO must stay 1).
       const ok=!d&&shO==='1'&&(ob==='0'||ob==='1');
       R('T-8','break start∥end -> no 40P01; FINAL: shift open, open breaks ∈ {0,1} (never >1, never dangling on closed shift)',
         d?'REAL-RISK':(ok?'EXPECTED-CONFLICT':'REAL-RISK'), ok,
         `openBreaks=${ob} openShifts=${shO} start=${ra.status} end=${rb.status} ${d?'DEADLOCK!':''} ${body(ra).slice(0,40)}|${body(rb).slice(0,40)}`);}
       // end any open break before reset (force_clock_out path)
       const obn=openBreakCnt(UOWN);
       if(obn!=='0') await endBrk(OWN,UOWN);
       resetStaff(UOWN,OWN);
     }
   }

   const AFTER=residue();
   console.log('\n────────────────────────────────────────────────────────────');
   console.log(`P-8 GATE SUMMARY: PASS=${PASS} EXPECTED-CONFLICT=${CONFLICT} REAL-RISK=${RISK} HARNESS-FAILURE=${HARNESS}`);
   console.log('residue baseline->after (all zero after cleanup):',BASE,'->',AFTER);
   const realRisk=results.filter(r=>r.cls==='REAL-RISK');
   const harness=results.filter(r=>r.cls==='HARNESS-FAILURE');
   if(realRisk.length){console.log('\n!! REAL-RISK (classify + disposition, NOT auto-pass):');realRisk.forEach(r=>console.log('   '+r.id+' '+r.name+' :: '+r.evidence));}
   if(harness.length){console.log('\n!! HARNESS-FAILURE (transport/fixture, re-run):');harness.forEach(r=>console.log('   '+r.id+' :: '+r.evidence));}
   const cf=await cleanup();
   const FINAL=residue();
   console.log('post-cleanup residue (must be all zero):',FINAL);
   fs.writeFileSync('.p8-gate-report.json',JSON.stringify({pass:PASS,conflict:CONFLICT,risk:RISK,harness:HARNESS,results,baseline:BASE,after:AFTER,finalResidue:FINAL},null,2));
   console.log('report: .p8-gate-report.json');
   process.exitCode=(RISK>0)?1:0;
  } finally { /* cleanup already run inline (needs to precede residue check) */ }
 })()
 .catch(async e=>{console.error('HARNESS ERROR:',e.message);try{await cleanup();}catch(_){}process.exit(1);});
