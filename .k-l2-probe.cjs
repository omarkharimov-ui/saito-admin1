// L2 (P0) live probe v2 (idempotent, zero-residue): Send-to-Kitchen location fix.
// Real flow = SEAT first (orders.create) then CREATE order (D-5 write resolver).
// Root cause (L1-3): create path used resolveLocationContext (authoritative D-5
// chain only) -> real staff (0 staff_locations, NULL active_location_id) got 400
// NO_LOCATION_CONTEXT. Fix: resolveWriteLocationContext adds the server-derived
// single-location-with-data fallback (mirrors the read path). Genuinely
// multi-location orgs must STILL fail closed (L2-5b).
// Run: node .k-l2-probe.cjs   (dev server on :3000)
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d',LOCB='70000000-0000-4000-8000-000000000002';
const APP='http://localhost:3000';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,90)+': '+r.stderr);return r.stdout.trim();}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,180)));}
function post(path,body,cookie){return new Promise((res,rej)=>{const u=new URL(APP+path);const r=require('http').request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:'POST',headers:{'Content-Type':'application/json',...(cookie?{'Cookie':`saito_token=${cookie}`}:{})}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);r.write(JSON.stringify(body||{}));r.end();});}
(async()=>{
  const TN=98; // test table @ Main Location (separate from 97 which we left clean)
  // cleanup (idempotent)
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number=${TN})`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number=${TN})`);
  S(`DELETE FROM outbox_events WHERE payload->>'table_number'='${TN}'`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number=${TN})`);
  S(`DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number=${TN})`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number=${TN})`);
  S(`DELETE FROM orders WHERE table_number=${TN}`);
  S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false WHERE table_number=${TN} AND location_id=${q(LOCA)}`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'L2_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'L2_%')`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name LIKE 'L2_%'`);

  const R_WTR=S("SELECT id::text FROM roles WHERE name='waiter'");
  const PROD=S('SELECT id::text FROM products ORDER BY created_at LIMIT 1').split('\n')[0].trim();
  // THE P0 CASE: unbound waiter (0 staff_locations, active_location_id NULL)
  const uid=crypto.randomUUID();
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(uid)},'L2_WTR','L2_WTR',${q(R_WTR)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  const tok=crypto.randomUUID();
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tok)},${q(uid)},'waiter',now()+interval '1h','ACTIVE',${q(ORG)},NULL)`);
  P('L2-0','fixture: unbound waiter (0 staff_locations, active_location_id NULL) = the P0 shape',
    S(`SELECT count(*)::text FROM staff_locations WHERE staff_id=${q(uid)}`)==='0'
    && S(`SELECT (active_location_id IS NULL)::text FROM sessions WHERE token=${q(tok)}`)==='true');
  // ensure table 98 exists @ LOCA, empty
  const t98=S(`SELECT count(*)::text FROM table_floors WHERE table_number=${TN} AND location_id=${q(LOCA)}`);
  if(t98==='0') S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${TN},'empty',${q(LOCA)},${q(ORG)})`);
  else S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false WHERE table_number=${TN} AND location_id=${q(LOCA)}`);

  // L2-1: SEAT (real POS step 1) works for the unbound waiter (session active_loc NULL -> locFilter empty)
  const rSeat=await post('/api/tables/seat',{table_number:TN,guest_count:2},tok);
  const tState=S(`SELECT status FROM table_floors WHERE table_number=${TN} AND location_id=${q(LOCA)}`);
  P('L2-1','seat (orders.create) -> 200 + table occupied (no NO_LOCATION_CONTEXT)',
    rSeat.status===200 && tState==='occupied', 'seat='+rSeat.status+' table='+tState+' '+rSeat.body.slice(0,60));

  // L2-2: SEND TO KITCHEN (real POS step 2: create order) NO LONGER 400 NO_LOCATION_CONTEXT
  const r1=await post('/api/orders',{table_number:TN,items:[{product_id:PROD,product_name:'P',quantity:1,unit_price:10}],kitchen_status:'pending'},tok);
  let b1={}; try{b1=JSON.parse(r1.body);}catch{}
  P('L2-2','unbound waiter Send-to-Kitchen (create order) -> works, NOT NO_LOCATION_CONTEXT',
    r1.status===200 && !(b1.error==='NO_LOCATION_CONTEXT'), 'status='+r1.status+' '+r1.body.slice(0,140));
  const o1=S(`SELECT id::text FROM orders WHERE table_number=${TN} AND location_id=${q(LOCA)} ORDER BY created_at DESC LIMIT 1`);

  // L2-3: order created in the CORRECT server-resolved location (single-location-with-data = Main Location)
  P('L2-3','created order location = server-resolved (Main Location, fallback) — never client-supplied',
    !!o1 && S(`SELECT location_id::text FROM orders WHERE id=${q(o1)}`)===LOCA, 'order.location='+(o1?S(`SELECT location_id::text FROM orders WHERE id=${q(o1)}`):'none'));

  // L2-4: table SSOT intact (occupied + current_order_id)
  const t98now=S(`SELECT status||'|'||coalesce(current_order_id::text,'null') FROM table_floors WHERE table_number=${TN} AND location_id=${q(LOCA)}`);
  P('L2-4','table SSOT intact: occupied + current_order_id = created order', t98now===('occupied|'+o1), t98now);

  // L2-5: append (resend/append path) works on the same unbound session
  const r4=await post('/api/orders',{action:'addItems',id:o1,items:[{product_id:PROD,product_name:'P',quantity:1,unit_price:5}]},tok);
  P('L2-5','addItems (resend/append) on unbound session -> 200 (same write resolver)', r4.status===200, 'status='+r4.status+' '+r4.body.slice(0,80));

  // L2-5b: FAIL-CLOSED GUARANTEE — a staff bound to LOCB in a MULTI-location org
  // with data in BOTH locations must NOT get a guessed location (fallback off).
  const oTmp=crypto.randomUUID();
  S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(oTmp)},NULL,'confirmed',1,${q(LOCB)},${q(ORG)},'pending',1)`);
  try {
    const uidB=crypto.randomUUID();
    S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(uidB)},'L2_B','L2_B',${q(R_WTR)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
    S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(uidB)},${q(LOCB)},true,true,${q(ORG)})`);
    const tokB=crypto.randomUUID();
    S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tokB)},${q(uidB)},'waiter',now()+interval '1h','ACTIVE',${q(ORG)},${q(LOCB)})`);
    const r5=await post('/api/orders',{table_number:TN,items:[{product_id:PROD,product_name:'P',quantity:1,unit_price:5}]},tokB);
    // The cross-loc attempt must be DENIED and must NOT create any order on the
    // LOCA table (enforce_order_table_location trigger blocks it; safe even if the
    // surface error is a 500 — the invariant is "no leak").
    const leak=S(`SELECT count(*)::text FROM orders WHERE table_number=${TN} AND location_id=${q(LOCB)}`);
    P('L2-5b','cross-loc: LOCB-bound staff creating on a LOCA table -> denied, NO order created (no leak)',
      r5.status>=400 && leak==='0', 'status='+r5.status+' leakLOCB='+leak+' '+r5.body.slice(0,80));
    // multi-location fail-closed: unbound staff while org has data in BOTH locations -> 400 NO_LOCATION_CONTEXT
    const uidC=crypto.randomUUID();
    S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(uidC)},'L2_C','L2_C',${q(R_WTR)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
    const tokC=crypto.randomUUID();
    S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tokC)},${q(uidC)},'waiter',now()+interval '1h','ACTIVE',${q(ORG)},NULL)`);
    const r5c=await post('/api/orders',{table_number:TN,items:[{product_id:PROD,product_name:'P',quantity:1,unit_price:5}]},tokC);
    let b5c={}; try{b5c=JSON.parse(r5c.body);}catch{}
    P('L2-5c','fail-closed: org with data in 2+ locations + unbound staff -> 400 NO_LOCATION_CONTEXT (no guess)',
      r5c.status===400 && b5c.error==='NO_LOCATION_CONTEXT', 'status='+r5c.status+' '+r5c.body.slice(0,80));
    S(`DELETE FROM sessions WHERE user_id IN (${q(uidB)},${q(uidC)})`);
    S(`DELETE FROM staff_locations WHERE staff_id IN (${q(uidB)},${q(uidC)})`);
    S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE id IN (${q(uidB)},${q(uidC)})`);
  } finally {
    S(`DELETE FROM orders WHERE id=${q(oTmp)}`);
  }

  // CLEANUP — zero residue (order via canonical-ish direct deletes; test-only data)
  S(`DELETE FROM kitchen_schedule WHERE order_id=${q(o1)}`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id'=${q(o1)} OR payload->>'table_number'='${TN}'`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id=${q(o1)}`);
  S(`DELETE FROM operation_logs WHERE order_id=${q(o1)}`);
  S(`DELETE FROM order_items WHERE order_id=${q(o1)}`);
  S(`DELETE FROM orders WHERE id=${q(o1)}`);
  S(`UPDATE table_floors SET status='empty', current_order_id=NULL, total_amount=0, guest_count=NULL, order_count=0, has_pending=false WHERE table_number=${TN} AND location_id=${q(LOCA)}`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'L2_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'L2_%')`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name LIKE 'L2_%'`);
  const resid=S(`SELECT count(*)::text FROM orders WHERE table_number=${TN}`);
  const tEnd=S(`SELECT status FROM table_floors WHERE table_number=${TN} AND location_id=${q(LOCA)}`);
  const staff=S(`SELECT count(*)::text FROM staff WHERE name LIKE 'L2_%' AND is_active=true`);
  P('L2-6','cleanup: 0 residue (orders + table reset empty + staff inactive)', resid==='0' && tEnd==='empty' && staff==='0', 'orders='+resid+' table='+tEnd+' staff_active='+staff);

  const pass=results.filter(r=>r.pass).length;
  console.log('\n'+pass+'/'+results.length+' L2 checks passed');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e.message);process.exit(2);});
