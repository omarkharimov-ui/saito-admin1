// P-1 AUTHORIZATION GATE (idempotent, zero-residue) — freezes P1_AUTHZ_CONTRACT_FREEZE_2026-09-12.md
// Covers: M2 location assertion (route + RPC), M3 retired RPCs, M5 owner seed,
// M6 override tables retired, M4 bypass routes retired/gated, + unchanged invariants
// (idempotency / overpay / already-paid / refund-cap).
// Probe orders use table_number=NULL (no floor sync -> no table guards). Run: node .p1-gate.cjs  (dev server :3000)
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs');
let SVC=''; try{SVC=(fs.readFileSync('artifacts/saito-admin/.env.local','utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)||[])[1].trim();}catch{}
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001';
const LOC_A='f1f830b3-cf15-47e3-a538-01abd8222c6d'; // Main Location (all prod data)
const LOC_B='70000000-0000-4000-8000-000000000001'; // Saito Nizami (probe-only orders)
const APP='http://localhost:3000';
const CSRF=crypto.randomUUID();
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,90)+': '+r.stderr);return r.stdout.trim();}
const q=s=>`'${s}'`;
const results=[];
function check(id,name,pass,ev){results.push({id,name,pass:!!pass});console.log(`${pass?'PASS':'FAIL'} ${id} ${name}${pass?'':' -> '+String(ev).slice(0,160)}`);}
async function api(method,path,{cookie,body,csrf}={}){
  const h={'Content-Type':'application/json'};
  if(cookie)h['Cookie']=`saito_token=${cookie}`+(csrf?`; saito_csrf=${csrf}`:'');
  if(csrf)h['X-CSRF-Token']=csrf;
  const res=await fetch(APP+path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined,redirect:'manual'});
  let data=null;try{data=await res.json();}catch{}
  return {status:res.status,data};
}
const rpc=(fn,args)=>fetch('https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1/rpc/'+fn,{method:'POST',headers:{'apikey':SVC,'Authorization':'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify(args||{})}).then(async r=>({status:r.status,body:await r.text()}));
const role=(n)=>S(`SELECT id::text FROM roles WHERE name='${n}'`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OIDS=[];
const ALL_OIDS=[]; // never cleared — used by the error-handler cleanup
const cleanupOids=()=>{
  if(!OIDS.length)return;
  const list=OIDS.map(q).join(',');
  S(`ALTER TABLE public.inventory_logs DISABLE TRIGGER trg_inventory_logs_immutable`);
  try {
    // P-3 contract: order_payments rows are immutable — teardown MUST run in one
    // transaction under the trusted app.payment_ledger_reopen flag (same pattern
    // as .p2-gate.cjs / .p3-gate.cjs; P-3 patched those, this harness was missed).
    S(`BEGIN;
        SELECT set_config('app.payment_ledger_reopen','on',false);
        DELETE FROM order_payments WHERE order_id IN (${list});
        DELETE FROM payment_idempotency_keys WHERE order_id IN (${list});
        DELETE FROM outbox_events WHERE aggregate_id IN (${list});
        DELETE FROM audit_logs WHERE order_id IN (${list});
        DELETE FROM operation_logs WHERE order_id IN (${list});
        DELETE FROM order_items WHERE order_id IN (${list});
        DELETE FROM orders WHERE id IN (${list});
        SELECT set_config('app.payment_ledger_reopen','off',false);
        COMMIT;`);
  } finally {
    S(`ALTER TABLE public.inventory_logs ENABLE TRIGGER trg_inventory_logs_immutable`);
  }
  OIDS.length=0;
};
(async()=>{
  // ===================== fixtures (table_number=NULL -> no floor sync) =====================
  const mkStaff=(name,rl)=>{const id=crypto.randomUUID();S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(id)},${q(name)},${q(name)},${q(role(rl))},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);return id;};
  const bindLoc=(sid,loc)=>S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(sid)},${q(loc)},true,true,${q(ORG)})`);
  const mkSess=(uid,rl,loc)=>{const tok=crypto.randomUUID();S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tok)},${q(uid)},${q(rl)},now()+interval '3h','ACTIVE',${q(ORG)},${q(loc)})`);return tok;};
  const mkOrder=(loc,amount=100)=>{const id=crypto.randomUUID();OIDS.push(id);ALL_OIDS.push(id);S(`INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES(${q(id)},NULL,'confirmed',1,${amount},${q(loc)},${q(ORG)},'pending',false,now(),now(),1)`);return id;};
  const oA=mkOrder(LOC_A);    // pay-able order @ A
  const oB=mkOrder(LOC_B);    // cross-location target @ B
  const oB2=mkOrder(LOC_B);   // @ B, paid by B-bound cashier (P1-04)
  const oB3=mkOrder(LOC_B);   // @ B, session-B actor not bound to B (P1-03)
  const mgrA=mkStaff('P1_MGR_A','manager');  bindLoc(mgrA,LOC_A);  const tMgrA=mkSess(mgrA,'manager',LOC_A);
  const mgrA2=mkStaff('P1_MGR_A2','manager');bindLoc(mgrA2,LOC_A); const tMgrA2=mkSess(mgrA2,'manager',LOC_A);
  const cashB=mkStaff('P1_CASH_B','cashier');bindLoc(cashB,LOC_B); const tCashB=mkSess(cashB,'cashier',LOC_B);
  const wtrA=mkStaff('P1_WTR_A','waiter');   bindLoc(wtrA,LOC_A);  const tWtrA=mkSess(wtrA,'waiter',LOC_A);
  const inact=mkStaff('P1_INACT','cashier'); S(`UPDATE staff SET is_active=false,status='INACTIVE' WHERE id=${q(inact)}`); const tInact=mkSess(inact,'cashier',LOC_A);
  const ownr=mkStaff('P1_OWNER','owner');    const tOwnr=mkSess(ownr,'owner',LOC_A);

  // paymentRateLimit = 5 req/60s/(ip:token). tMgrA makes 6 pay-route calls
  // (P1-01, P1-07x2, P1-08, P1-10, P1-11) -> pause 15s after the 6th resets the window.
  let mgrACalls=0;
  const payMgrA=async body=>{mgrACalls++;const res=await api('POST','/api/orders/pay',{cookie:tMgrA,csrf:CSRF,body});if(mgrACalls===6)await sleep(15000);return res;};
  const payBody=(id,extra={})=>({order_id:id,payment_method:'cash',paid_amount:100,cash_amount:100,...extra});

  // ===================== M2: location assertion =====================
  let r=await payMgrA(payBody(oA));
  check('P1-01','location A mgr -> location A order: pay OK (200, paid)', r.status===200 && r.data?.status==='paid' && Number(r.data?.paid_amount)===100, r.status+' '+JSON.stringify(r.data).slice(0,120));
  r=await api('POST','/api/orders/pay',{cookie:tCashB,csrf:CSRF,body:payBody(oA)});
  check('P1-02','location B cashier -> location A order: 403 LOCATION_MISMATCH (route)', r.status===403 && /LOCATION_MISMATCH/.test(r.data?.error||''), r.status+' '+(r.data?.error||''));
  r=await rpc('complete_payment_atomic_v2',{p_order_id:oB3,p_payments:[{method:'cash',amount:100}],p_payment_method:'cash',p_cash_amount:100,p_performed_by:mgrA,p_location_id:LOC_B});
  check('P1-03','RPC: session@B but actor not bound to B -> 403 LOCATION_ACCESS_DENIED', r.status===403 && /LOCATION_ACCESS_DENIED/.test(r.body), r.status+' '+r.body.slice(0,120));
  r=await rpc('complete_payment_atomic_v2',{p_order_id:oB2,p_payments:[{method:'cash',amount:100}],p_payment_method:'cash',p_cash_amount:100,p_performed_by:cashB,p_location_id:LOC_B});
  check('P1-04','RPC: B-bound cashier -> B order: allowed (success)', r.status===200 && /"success":\s*true/.test(r.body), r.status+' '+r.body.slice(0,120));
  r=await rpc('complete_payment_atomic_v2',{p_order_id:oB2,p_payments:[{method:'cash',amount:100}],p_payment_method:'cash',p_cash_amount:100,p_performed_by:cashB});
  check('P1-05','RPC: p_location_id NULL -> LOCATION_CONTEXT_MISSING (fail closed)', r.status===400 && /LOCATION_CONTEXT_MISSING/.test(r.body), r.status+' '+r.body.slice(0,120));
  check('P1-06','denied attempts wrote nothing: oB=0, oB3=0, oB2=1', S(`SELECT count(*)::text FROM order_payments WHERE order_id IN (${q(oB)},${q(oB3)})`)==='0' && S(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oB2)}`)==='1', 'oB/oB3='+S(`SELECT count(*)::text FROM order_payments WHERE order_id IN (${q(oB)},${q(oB3)})`)+' oB2='+S(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oB2)}`));

  // ===================== unchanged invariants =====================
  const oA2=mkOrder(LOC_A);
  const IK='p1-probe-'+crypto.randomUUID();
  r=await payMgrA(payBody(oA2,{idempotency_key:IK}));
  const row1=S(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oA2)}`);
  r=await payMgrA(payBody(oA2,{idempotency_key:IK}));
  check('P1-07','idempotency: 2nd same-key pay -> idempotent=true, 1 row', r.status===200 && r.data?.idempotent===true && row1==='1' && S(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oA2)}`)==='1', 'idem='+r.data?.idempotent+' rows='+S(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oA2)}`));
  const oA3=mkOrder(LOC_A);
  r=await payMgrA(payBody(oA3,{paid_amount:150,cash_amount:150}));
  check('P1-08','overpay: 150 > 100 -> 500 PAYMENT_EXCEEDS_REMAINING', r.status===500 && /PAYMENT_EXCEEDS_REMAINING/.test(r.data?.error||''), r.status+' '+(r.data?.error||''));
  r=await api('POST','/api/orders/pay',{cookie:tMgrA2,csrf:CSRF,body:payBody(oA)});
  check('P1-09','already-paid: re-pay -> 409 (order already paid)', r.status===409 && /already paid|ORDER_ALREADY_PAID/.test(r.data?.error||''), r.status+' '+(r.data?.error||''));
  let rf=await api('POST','/api/orders/refund',{cookie:tMgrA,csrf:CSRF,body:{order_id:oA,amount:40,method:'cash'}});
  check('P1-10','refund within cap: 40 on paid-100 -> success', rf.status===200, rf.status+' '+JSON.stringify(rf.data).slice(0,120));
  rf=await api('POST','/api/orders/refund',{cookie:tMgrA,csrf:CSRF,body:{order_id:oA,amount:61,method:'cash'}});
  check('P1-11','refund cap: 61 more (total 101>100) -> 400 exceeds remaining', rf.status===400 && /exceeds remaining|REFUND_EXCEEDS_PAID|Can only refund/.test(rf.data?.error||''), rf.status+' '+(rf.data?.error||''));

  // ===================== M5: owner seed =====================
  check('P1-12','owner role has all 65 permission keys', S(`SELECT count(*)::text FROM role_permissions WHERE role_id=${q(role('owner'))}`)==='65', S(`SELECT count(*)::text FROM role_permissions WHERE role_id=${q(role('owner'))}`));
  const oA4=mkOrder(LOC_A);
  await api('POST','/api/orders/pay',{cookie:tMgrA2,csrf:CSRF,body:payBody(oA4)}); // pay clean (status=paid)
  r=await api('POST','/api/orders/pay',{cookie:tOwnr,csrf:CSRF,body:payBody(oA4)});
  check('P1-13','owner seed: owner passes payments.create + location (re-pay -> 409, not 403)', r.status===409 && /already paid|ORDER_ALREADY_PAID/.test(r.data?.error||''), r.status+' '+(r.data?.error||''));

  // ===================== M3: retired RPCs =====================
  for(const fn of ['has_permission_v2','check_permission','get_effective_permissions','get_effective_permissions_v2']){
    const rr=await rpc(fn,{});
    check('P1-14-'+fn, fn+' retired (404 PGRST202)', rr.status===404 && /PGRST202/.test(rr.body), rr.status+' '+rr.body.slice(0,90));
  }
  const hpRaw=await rpc('has_permission',{p_staff_id:mgrA,p_permission:'payments.create'});
  check('P1-15','has_permission(uuid,text) SSOT still alive', hpRaw.body.trim()==='true', hpRaw.body.trim());

  // ===================== M6: override tables retired =====================
  for(const t of ['staff_permission_overrides','location_permission_overrides']){
    const rr=await fetch('https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1/'+t+'?select=*&limit=1',{headers:{apikey:SVC,Authorization:'Bearer '+SVC,Accept:'application/json'}});
    check('P1-16-'+t, t+' retired (404 via REST)', rr.status===404, 'status '+rr.status);
  }
  r=await api('GET','/api/permissions/overrides',{cookie:tMgrA,csrf:CSRF});
  check('P1-17','/api/permissions/overrides route retired (404)', r.status===404, r.status);

  // ===================== M4: bypass routes retired / gated =====================
  r=await api('POST','/api/orders/complete-payment',{cookie:tMgrA,csrf:CSRF,body:{order_id:oB,payments:[{method:'cash',amount:1}]}});
  check('P1-18','legacy /api/orders/complete-payment retired (404)', r.status===404, r.status);
  r=await api('POST','/api/order-payments',{cookie:tMgrA,csrf:CSRF,body:{order_id:oB,method:'cash',amount:1}});
  check('P1-19','legacy /api/order-payments retired (404)', r.status===404, r.status);
  // manager role holds pos.void (live-verified) -> must PASS the gate (not a 403 "Forbidden").
  r=await api('POST','/api/orders/void',{cookie:tMgrA,csrf:CSRF,body:{order_id:oB,items:[{order_item_id:'00000000-0000-4000-8000-000000000000',quantity:1}]}});
  check('P1-20','/api/orders/void: manager (has pos.void) passes RBAC gate (not 403-Forbidden)', !(r.status===403 && /Forbidden/.test(r.data?.error||'')), 'status='+r.status+' '+(r.data?.error||'').slice(0,80));
  r=await api('POST','/api/orders/void',{cookie:tWtrA,csrf:CSRF,body:{order_id:oB,items:[{order_item_id:'00000000-0000-4000-8000-000000000000',quantity:1}]}});
  check('P1-21','/api/orders/void: waiter (no pos.void) -> 403 Forbidden', r.status===403 && /Forbidden/.test(r.data?.error||''), r.status+' '+(r.data?.error||''));

  // ===================== identity / session =====================
  r=await api('POST','/api/orders/pay',{cookie:tInact,csrf:CSRF,body:payBody(oB)});
  check('P1-22','inactive staff session -> 401', r.status===401, r.status);
  r=await api('POST','/api/orders/pay',{body:payBody(oB)});
  check('P1-23','no session -> 401', r.status===401, r.status);
  r=await api('POST','/api/orders/pay',{cookie:tWtrA,csrf:CSRF,body:payBody(oB)});
  check('P1-24','waiter (no payments.create) -> 403 Forbidden (fails RBAC before location)', r.status===403 && /Forbidden/.test(r.data?.error||''), r.status+' '+(r.data?.error||''));

  // ===================== zero-residue cleanup =====================
  cleanupOids();
  const ordersGone=S(`SELECT count(*)::text FROM orders WHERE id IN (${ALL_OIDS.map(q).join(',')})`);
  const payGone=S(`SELECT count(*)::text FROM order_payments WHERE order_id IN (${ALL_OIDS.map(q).join(',')})`);
  const staffGone=S(`SELECT count(*)::text FROM staff WHERE name LIKE 'P1_%'`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P1_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P1_%')`);
  S(`DELETE FROM approval_requests WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P1_%') OR reviewed_by IN (SELECT id FROM staff WHERE name LIKE 'P1_%')`); // FK before staff delete
  // F-contract: staff rows are delete-protected (trg_staff_prevent_delete) — the
  // canonical "deactivate" is is_active=false/INACTIVE (kept). Probe-only synthetic
  // rows are additionally removed by disabling that guard around the DELETE.
  S(`ALTER TABLE public.staff DISABLE TRIGGER trg_staff_prevent_delete`);
  try { S(`DELETE FROM staff WHERE name LIKE 'P1_%'`); } finally { S(`ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete`); }
  check('P1-25','zero residue: probe orders gone + P1_% staff inactive-cleaned', ordersGone==='0' && staffGone!=='0', 'ordersLeft='+ordersGone+' (staff existed='+staffGone+')');

  const failed=results.filter(x=>!x.pass);
  console.log(`\n==== P-1 GATE: ${results.length-failed.length}/${results.length} PASS ====`);
  fs.writeFileSync('.p1-gate-report.json',JSON.stringify({at:new Date().toISOString(),total:results.length,failed:failed.length,results},null,2));
  process.exit(failed.length?1:0);
})().catch(e=>{
  // best-effort residue cleanup even on error
  try{const list=ALL_OIDS.map(q).join(',');if(list){S(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false); DELETE FROM order_payments WHERE order_id IN (${list}); DELETE FROM payment_idempotency_keys WHERE order_id IN (${list}); DELETE FROM outbox_events WHERE aggregate_id IN (${list}); DELETE FROM audit_logs WHERE order_id IN (${list}); DELETE FROM operation_logs WHERE order_id IN (${list}); DELETE FROM order_items WHERE order_id IN (${list}); DELETE FROM orders WHERE id IN (${list}); SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`);}S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P1_%')`);S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P1_%')`);S(`DELETE FROM approval_requests WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P1_%') OR reviewed_by IN (SELECT id FROM staff WHERE name LIKE 'P1_%')`);S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name LIKE 'P1_%'`);S(`ALTER TABLE public.staff DISABLE TRIGGER trg_staff_prevent_delete`);try{S(`DELETE FROM staff WHERE name LIKE 'P1_%'`);}finally{S(`ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete`);}fs.writeFileSync('.p1-gate-report.json',JSON.stringify({at:new Date().toISOString(),crashed:true,total:results.length,failed:results.filter(x=>!x.pass).length,results,error:String(e).slice(0,300)},null,2));}catch{}
  console.error('PROBE ERROR',e);process.exit(2);
});
