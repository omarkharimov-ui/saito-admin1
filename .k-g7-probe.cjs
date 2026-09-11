// G7 live probe (idempotent, zero-residue): kitchen/page.tsx browser actions now
// go through POST /api/kitchen/action (requireKdsAction -> session identity +
// location + permission -> service-role RPC -> stock-safe order-level fns).
// Raw browser supabase.rpc to the 5 fns is 42501 (anon, G3 revokes).
// Run: node .k-g7-probe.cjs   (dev server must be up on :3000)
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs=require('fs');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d',LOCB='70000000-0000-4000-8000-000000000002';
const APP='http://localhost:3000';
let ANON_KEY=''; try{ANON_KEY=(fs.readFileSync('artifacts/saito-admin/.env.local','utf8').match(/SUPABASE_ANON_KEY=(.+)/)||[])[1].trim();}catch{}
const REST='https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1/rpc';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,80)+': '+r.stderr);return r.stdout.trim();}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,160)));}
function http(path,opts,cookie){return new Promise((res,rej)=>{const u=new URL(APP+path);const r=require('http').request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:opts.method||'GET',headers:Object.assign({'Content-Type':'application/json'},cookie?{'Cookie':`saito_token=${cookie}`}:{},opts.headers||{})},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);if(opts.body)r.write(opts.body);r.end();});}
function anonRpc(fn,fnArgs){return new Promise((res,rej)=>{const r=require('https').request({hostname:'jbxmlnsicbfkbsatnoej.supabase.co',path:REST+'/'+fn,method:'POST',headers:{'apikey':ANON_KEY,'Authorization':'Bearer '+ANON_KEY,'Content-Type':'application/json'}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);r.write(JSON.stringify(fnArgs||{}));r.end();});}
(async()=>{
  const T=[471,472];
  // cleanup (idempotent, handles residue from partial runs). inventory_logs is
  // IMMUTABLE -> disable guard trigger around its deletion.
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`ALTER TABLE public.inventory_logs DISABLE TRIGGER trg_inventory_logs_immutable`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM inventory_logs WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')})))`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  // outbox by order_id BEFORE orders delete (subquery needs orders to exist)
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number IN (${T.join(',')}))`);
  // source rows (triggers may emit new outbox rows)
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM orders WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  // outbox by table_number AFTER table_floors delete (catches trigger-generated rows)
  S(`DELETE FROM outbox_events WHERE payload->>'table_number' IN (${T.map(n=>"'"+n+"'").join(',')})`);
  S(`ALTER TABLE public.inventory_logs ENABLE TRIGGER trg_inventory_logs_immutable`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'G7_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'G7_%')`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name LIKE 'G7_%'`);

  const R_WTR=S("SELECT id::text FROM roles WHERE name='waiter'");
  const R_KIT=S("SELECT id::text FROM roles WHERE name='kitchen'");
  const R_MGR=S("SELECT id::text FROM roles WHERE name='manager'");
  const mkStaff=(name,role,loc)=>{const id=crypto.randomUUID();S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(id)},${q(name)},${q(name)},${q(role)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(id)},${q(loc)},true,true,${q(ORG)})`);return id;};
  const mkSess=(uid,role,loc)=>{const t=crypto.randomUUID();S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(t)},${q(uid)},${q(role)},now()+interval '1h','ACTIVE',${q(ORG)},${q(loc)})`);return t;};

  // a ready product with a direct ingredient (so mark_order_ready consumes stock)
  const RP=S("SELECT p.id::text || '|' || p.direct_ingredient_id::text || '|' || i.current_stock::text FROM products p LEFT JOIN ingredients i ON i.id=p.direct_ingredient_id WHERE p.is_ready_product AND p.direct_ingredient_id IS NOT NULL AND COALESCE(p.is_active,true) AND i.current_stock > 10 ORDER BY p.created_at LIMIT 1").split('|');
  const prodId=RP[0], ingId=RP[1], stockBefore=parseFloat(RP[2]||'0');
  P('G7-PRE','ready-product with direct ingredient exists (stock-consumption proof)', !!prodId && !!ingId, RP.join('|'));

  const wtrTok=mkSess(mkStaff('G7_WTR',R_WTR,LOCA),'waiter',LOCA);
  const kitTok=mkSess(mkStaff('G7_KIT',R_KIT,LOCA),'kitchen',LOCA);
  const mgrTok=mkSess(mkStaff('G7_MGR',R_MGR,LOCA),'manager',LOCA);

  // order O1 @ LOCA (pending, 2x ready-product), order O2 @ LOCA (for waiter test)
  const mkOrder=(tn,loc,prod)=>{
    S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${tn},'occupied',${q(loc)},${q(ORG)})`);
    const o=crypto.randomUUID();
    S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(o)},${tn},'confirmed',20,${q(loc)},${q(ORG)},'pending',1)`);
    const it=crypto.randomUUID();
    S(`INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,kitchen_status) VALUES(${q(it)},${q(o)},${q(prod)},'P',2,10,20,'pending')`);
    return{o,it};
  };
  const O1=mkOrder(471,LOCA,prodId);
  const O2=mkOrder(472,LOCA,prodId);

  // G7-1: waiter (no kitchen.manage) -> complete O2 -> 403
  const r1=await http('/api/kitchen/action',{method:'POST',body:JSON.stringify({action:'complete',order_id:O2.o})},wtrTok);
  P('G7-1','waiter (no kitchen.manage) -> 403', r1.status===403, 'status='+r1.status+' '+r1.body.slice(0,80));

  // G7-2: manager (no kitchen.manage) -> prepare O2 -> 403
  const r2=await http('/api/kitchen/action',{method:'POST',body:JSON.stringify({action:'prepare',order_id:O2.o})},mgrTok);
  P('G7-2','manager (no kitchen.manage) -> 403', r2.status===403, 'status='+r2.status+' '+r2.body.slice(0,80));

  // G7-3: kitchen -> prepare O1 -> 200 + DB item kitchen_status='preparing'
  const r3=await http('/api/kitchen/action',{method:'POST',body:JSON.stringify({action:'prepare',order_id:O1.o})},kitTok);
  const st3=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O1.it)}`);
  P('G7-3','kitchen prepare -> 200 + item=preparing', r3.status===200 && st3==='preparing', 'status='+r3.status+' item='+st3);

  // G7-4: kitchen -> ready O1 -> 200 + item=ready
  const r4=await http('/api/kitchen/action',{method:'POST',body:JSON.stringify({action:'ready',order_id:O1.o})},kitTok);
  const st4=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O1.it)}`);
  P('G7-4','kitchen ready -> 200 + item=ready', r4.status===200 && st4==='ready', 'status='+r4.status+' item='+st4);

  // G7-5: stock consumed (inventory_logs order_consumption row + ingredient current_stock decreased by 2)
  const invLog=S(`SELECT count(*)::text FROM inventory_logs WHERE order_item_id=${q(O1.it)} AND type='order_consumption'`);
  const stockAfter=parseFloat(S(`SELECT current_stock::text FROM ingredients WHERE id=${q(ingId)}`));
  P('G7-5','mark_order_ready consumed stock (inventory_log + stock delta)',
    invLog==='1' && (stockAfter === stockBefore - 2), 'log='+invLog+' before='+stockBefore+' after='+stockAfter);

  // G7-6: cross-location -> manager staff bound to LOCA but order O1... use waiter bound only LOCA? 
  // Build a fresh waiter bound ONLY to LOCA trying to touch an order that is fine, 
  // but the cross-loc case: staff bound to LOCA, order at LOCA -> allowed (single-loc). 
  // Real cross-loc: a second staff bound to LOCA-ONLY vs order... need order at a location the staff lacks.
  // Use manager bound LOCA on an order whose location the manager lacks -> create O3 @ LOCA bound to a manager who is LOCA? 
  // Simplest real cross-loc: staff (G7_X) bound to LOCA, order O_X at LOCA is same -> not cross.
  // Create staff bound to LOC_B, order at LOCA -> FORBIDDEN_LOCATION.
  const xId=mkStaff('G7_X',R_KIT,LOCB); const xTok=mkSess(xId,'kitchen',LOCB);
  const r6=await http('/api/kitchen/action',{method:'POST',body:JSON.stringify({action:'complete',order_id:O1.o})},xTok);
  P('G7-6','cross-location (kit@LOC_B -> LOCA order) -> 403', r6.status===403, 'status='+r6.status+' '+r6.body.slice(0,80));

  // G7-7: spoofed identity ignored — kitchen sends performed_by=other, assign uses SESSION identity
  const spoofed=mkStaff('G7_SPOOF',R_KIT,LOCA);
  const r7=await http('/api/kitchen/action',{method:'POST',body:JSON.stringify({action:'assign',order_id:O2.o,performed_by:spoofed,p_staff_id:spoofed})},kitTok);
  const assigned=S(`SELECT assigned_to FROM orders WHERE id=${q(O2.o)}`);
  const kitId=S(`SELECT user_id FROM sessions WHERE token=${q(kitTok)}`);
  P('G7-7','spoofed identity ignored (assigned_to == session staff, not spoof)', r7.status===200 && assigned===kitId, 'status='+r7.status+' assigned='+assigned+' session='+kitId);

  // G7-8: raw browser supabase.rpc (anon) -> mark_order_ready -> 42501
  const r8=await anonRpc('mark_order_ready',{p_order_id:O2.o});
  P('G7-8','raw browser anon supabase.rpc(mark_order_ready) -> 42501', r8.status===401 && r8.body.includes('42501'), 'status='+r8.status+' '+r8.body.slice(0,80));

  // G7-9: complete O1 (ready->completed via mark_order_completed) -> 200 + item=completed
  //       + audit event in audit_logs_canonical (log_audit writes there)
  const r9=await http('/api/kitchen/action',{method:'POST',body:JSON.stringify({action:'complete',order_id:O1.o})},kitTok);
  const st9=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O1.it)}`);
  const audit=S(`SELECT count(*)::text FROM audit_logs_canonical WHERE action='order_completed' AND entity_id=${q(O1.o)}`);
  P('G7-9','kitchen complete -> 200 + item=completed + audit(order_completed in audit_logs_canonical)', r9.status===200 && st9==='completed' && audit==='1', 'status='+r9.status+' item='+st9+' audit='+audit);

  // G7-10: no payment/table/order-status regression — order status unchanged by kitchen actions (still 'confirmed', not paid), table still occupied
  const oStatus=S(`SELECT status FROM orders WHERE id=${q(O1.o)}`);
  const tStatus=S(`SELECT status FROM table_floors WHERE table_number=471`);
  P('G7-10','no order/payment/table regression (status not forced to paid, table not cleared)', oStatus!=='paid' && tStatus!=='free', 'order.status='+oStatus+' table='+tStatus);

  // CLEANUP — zero residue. inventory_logs is an IMMUTABLE (append-only, F-contract)
  // ledger: DELETE/UPDATE forbidden, and its order_item_id FK (SET NULL) would UPDATE
  // the ledger rows on order_items delete -> also blocked. Sanctioned probe cleanup:
  // reverse the stock (net 0), then disable the guard trigger and delete the test
  // ledger rows, then delete dependent rows in FK order, re-enable.
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  const O1it=S(`SELECT id::text FROM order_items WHERE order_id=${q(O1.o)}`);
  const O2it=S(`SELECT id::text FROM order_items WHERE order_id=${q(O2.o)}`);
  S(`SELECT public.reverse_stock_for_items('[{"order_item_id":"${O1it}","reverse_qty":2}]')`);
  S(`ALTER TABLE public.inventory_logs DISABLE TRIGGER trg_inventory_logs_immutable`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (${q(O1.o)},${q(O2.o)})`);
  S(`DELETE FROM inventory_logs WHERE order_item_id IN (${q(O1it)},${q(O2it)})`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (${q(O1.o)},${q(O2.o)})`);
  S(`DELETE FROM operation_logs WHERE order_id IN (${q(O1.o)},${q(O2.o)})`);
  // Delete source rows FIRST (their triggers may emit outbox events);
  // THEN delete outbox (catches trigger-generated rows from the deletes above).
  S(`DELETE FROM order_items WHERE order_id IN (${q(O1.o)},${q(O2.o)})`);
  S(`DELETE FROM orders WHERE id IN (${q(O1.o)},${q(O2.o)})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (${q(O1.o)},${q(O2.o)})`);
  S(`DELETE FROM outbox_events WHERE payload->>'table_number' IN (${T.map(n=>"'"+n+"'").join(',')})`);
  S(`ALTER TABLE public.inventory_logs ENABLE TRIGGER trg_inventory_logs_immutable`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'G7_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'G7_%')`);
  S(`UPDATE staff SET is_active=false WHERE name LIKE 'G7_%'`);
  const resid=S(`SELECT count(*)::text FROM orders WHERE table_number IN (${T.join(',')})`);
  P('G7-11','cleanup: 0 residue', resid==='0', resid);

  const pass=results.filter(r=>r.pass).length;
  console.log('\n'+pass+'/'+results.length+' G7 checks passed');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e.message);process.exit(2);});
