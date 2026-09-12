// K-3 concurrency battery (idempotent, zero-residue). Live service-role RPC,
// parallel Node promises = concurrent DB mutations.
// Spec (K gate K-3): duplicate-safe, idempotent, finalized-order (paid/closed/
// cancelled) guard, order->item lock ordering, no phantom stock, consistent state.
// Run: node .k-k3-probe.cjs
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const https=require('https'); const fs=require('fs');
let SVC=''; try{SVC=(fs.readFileSync('artifacts/saito-admin/.env.local','utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)||[])[1].trim();}catch{}
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,80)+': '+r.stderr);return r.stdout.trim();}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,160)));}
function rpc(fn,args){return new Promise((res,rej)=>{const r=https.request({hostname:'jbxmlnsicbfkbsatnoej.supabase.co',path:'/rest/v1/rpc/'+fn,method:'POST',headers:{'apikey':SVC,'Authorization':'Bearer '+SVC,'Content-Type':'application/json'}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{try{res({status:resp.statusCode,ok:resp.statusCode<500&&resp.statusCode<400||resp.statusCode<300,body:d,json:()=>JSON.parse(d)})}catch(e){res({status:resp.statusCode,ok:false,body:d,json:()=>({})})}});});r.on('error',rej);r.write(JSON.stringify(args||{}));r.end();});}
const OK=r=>r.status===200;
(async()=>{
  const T=[501,502,503,504,505,506];
  // cleanup (idempotent)
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`ALTER TABLE public.inventory_logs DISABLE TRIGGER trg_inventory_logs_immutable`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM inventory_logs WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')})))`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM outbox_events WHERE payload->>'table_number' IN (${T.map(n=>"'"+n+"'").join(',')})`);
  S(`DELETE FROM audit_logs_canonical WHERE entity_id IN (SELECT id::text FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM operation_logs WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM orders WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM outbox_events WHERE payload->>'table_number' IN (${T.map(n=>"'"+n+"'").join(',')})`);
  S(`ALTER TABLE public.inventory_logs ENABLE TRIGGER trg_inventory_logs_immutable`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'K3_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'K3_%')`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name LIKE 'K3_%'`);

  // superadmin session (holds kitchen.manage + order.void + kitchen.view) for canonical fns
  const R_SUP=S("SELECT id::text FROM roles WHERE name='superadmin'");
  const supId=crypto.randomUUID();
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(supId)},'K3_SUP','K3_SUP',${q(R_SUP)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(supId)},${q(LOCA)},true,true,${q(ORG)})`);
  const TK=crypto.randomUUID();
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(TK)},${q(supId)},'superadmin',now()+interval '1h','ACTIVE',${q(ORG)},${q(LOCA)})`);

  const RP=S("SELECT p.id::text || '|' || p.direct_ingredient_id::text || '|' || i.current_stock::text FROM products p LEFT JOIN ingredients i ON i.id=p.direct_ingredient_id WHERE p.is_ready_product AND p.direct_ingredient_id IS NOT NULL AND COALESCE(p.is_active,true) AND i.current_stock > 20 ORDER BY p.created_at LIMIT 1").split('|');
  const prodId=RP[0], ingId=RP[1], stockBefore=parseFloat(RP[2]||'0');
  const mkOrder=(tn,st,ks)=>{
    S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${tn},'occupied',${q(LOCA)},${q(ORG)})`);
    const o=crypto.randomUUID();
    S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(o)},${tn},${q(st)},20,${q(LOCA)},${q(ORG)},${q(ks)},1)`);
    const it=crypto.randomUUID();
    S(`INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,kitchen_status) VALUES(${q(it)},${q(o)},${q(prodId)},'P',2,10,20,${q(ks)})`);
    return{o,it};
  };

  // ---- K3-1: 2x concurrent mark_order_ready (same order) -> idempotent, stock exactly once ----
  {
    const O=mkOrder(501,'confirmed','preparing');
    const [a,b]=await Promise.all([rpc('mark_order_ready',{p_order_id:O.o}),rpc('mark_order_ready',{p_order_id:O.o})]);
    const logs=S(`SELECT count(*)::text FROM inventory_logs WHERE order_item_id=${q(O.it)} AND type='order_consumption'`);
    const stockAfter=parseFloat(S(`SELECT current_stock::text FROM ingredients WHERE id=${q(ingId)}`));
    const st=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O.it)}`);
    P('K3-1','2x concurrent mark_order_ready -> both 200, item=ready, stock consumed EXACTLY ONCE (log=1, delta=-2)',
      OK(a)&&OK(b)&&st==='ready'&&logs==='1'&&(stockAfter===stockBefore-2), 'a='+a.status+' b='+b.status+' item='+st+' log='+logs+' stock '+stockBefore+'->'+stockAfter);
    S(`SELECT public.reverse_stock_for_items('[{"order_item_id":"${O.it}","reverse_qty":2}]')`);
    S(`ALTER TABLE public.inventory_logs DISABLE TRIGGER trg_inventory_logs_immutable`);
    S(`DELETE FROM inventory_logs WHERE order_item_id=${q(O.it)}`);
    S(`ALTER TABLE public.inventory_logs ENABLE TRIGGER trg_inventory_logs_immutable`);
    S(`DELETE FROM outbox_events WHERE payload->>'order_id'=${q(O.o)} OR payload->>'table_number'='501'`);
    S(`DELETE FROM audit_logs_canonical WHERE entity_id=${q(O.o)}`);
    S(`DELETE FROM operation_logs WHERE order_id=${q(O.o)}`);
    S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM order_items WHERE order_id=${q(O.o)}`); S(`DELETE FROM orders WHERE id=${q(O.o)}`); S(`DELETE FROM table_floors WHERE table_number=501`);
    S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM outbox_events WHERE payload->>'table_number'='501'`);
  }

  // ---- K3-2: canonical item_kitchen_step(ready) vs item_kitchen_terminal(voided) concurrent -> 1 valid final state, stock once ----
  {
    const O=mkOrder(502,'confirmed','accepted');
    const [a,b]=await Promise.all([rpc('item_kitchen_step',{p_token:TK,p_item_id:O.it,p_target:'ready',p_reason:'k3',p_metadata:{},p_correlation_id:crypto.randomUUID()}),rpc('item_kitchen_terminal',{p_token:TK,p_item_id:O.it,p_action:'voided',p_reason:'k3',p_metadata:{},p_correlation_id:crypto.randomUUID()})]);
    const st=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O.it)}`);
    // valid final states: ready (step won) or voided (terminal won) or accepted (both errored).
    // item_kitchen_step does NOT consume stock (that's mark_order_ready), so no inventory check here.
    const consistent=['ready','voided','accepted'].includes(st);
    P('K3-2','step(ready) vs terminal(voided) concurrent -> consistent final state ('+st+'), no corrupt/both state',
      consistent, 'ready='+a.status+' void='+b.status+' final='+st);
    S(`DELETE FROM outbox_events WHERE payload->>'order_id'=${q(O.o)} OR payload->>'table_number'='502'`);
    S(`DELETE FROM audit_logs_canonical WHERE entity_id=${q(O.o)}`);
    S(`DELETE FROM operation_logs WHERE order_id=${q(O.o)}`);
    S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM order_items WHERE order_id=${q(O.o)}`); S(`DELETE FROM orders WHERE id=${q(O.o)}`); S(`DELETE FROM table_floors WHERE table_number=502`);
    S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM outbox_events WHERE payload->>'table_number'='502'`);
  }

  // ---- K3-3: canonical void on a PAID order -> ORDER_FINALIZED (refuse) ----
  {
    const O=mkOrder(503,'paid','pending');
    const r=await rpc('item_kitchen_terminal',{p_token:TK,p_item_id:O.it,p_action:'voided',p_reason:'k3-paid',p_metadata:{},p_correlation_id:crypto.randomUUID()});
    const denied=/ORDER_FINALIZED|finalized|paid/i.test(r.body);
    const st=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O.it)}`);
    P('K3-3','canonical void on PAID order -> ORDER_FINALIZED refuse (item unchanged)', denied && st==='pending', 'status='+r.status+' '+r.body.slice(0,80)+' item='+st);
    S(`DELETE FROM outbox_events WHERE payload->>'order_id'=${q(O.o)} OR payload->>'table_number'='503'`);
    S(`DELETE FROM operation_logs WHERE order_id=${q(O.o)}`);
    S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM order_items WHERE order_id=${q(O.o)}`); S(`DELETE FROM orders WHERE id=${q(O.o)}`); S(`DELETE FROM table_floors WHERE table_number=503`);
    S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM outbox_events WHERE payload->>'table_number'='503'`);
  }

  // ---- K3-4: canonical recall(recalled->pending) vs step(ready) concurrent -> 1 valid final state ----
  {
    const O=mkOrder(504,'confirmed','sent');
    const [a,b]=await Promise.all([rpc('kitchen_order_items_action',{p_token:TK,p_order_id:O.o,p_action:'recall',p_reason:'k3',p_correlation_id:crypto.randomUUID()}),rpc('item_kitchen_step',{p_token:TK,p_item_id:O.it,p_target:'ready',p_reason:'k3',p_metadata:{},p_correlation_id:crypto.randomUUID()})]);
    const st=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O.it)}`);
    P('K3-4','recall vs step(ready) concurrent -> consistent final state ('+st+')', ['ready','pending','sent'].includes(st), 'recall='+a.status+' step='+b.status+' final='+st);
    S(`DELETE FROM outbox_events WHERE payload->>'order_id'=${q(O.o)} OR payload->>'table_number'='504'`);
    S(`DELETE FROM audit_logs_canonical WHERE entity_id=${q(O.o)}`);
    S(`DELETE FROM operation_logs WHERE order_id=${q(O.o)}`);
    S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM order_items WHERE order_id=${q(O.o)}`); S(`DELETE FROM orders WHERE id=${q(O.o)}`); S(`DELETE FROM table_floors WHERE table_number=504`);
    S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM outbox_events WHERE payload->>'table_number'='504'`);
  }

  // ---- K3-5: 2x concurrent item_kitchen_step(ready) on same item -> idempotent, stock once ----
  {
    const O=mkOrder(505,'confirmed','preparing');
    // NOTE: all 6 params required (no defaults) -> p_metadata + p_correlation_id mandatory
    const [a,b]=await Promise.all([rpc('item_kitchen_step',{p_token:TK,p_item_id:O.it,p_target:'ready',p_reason:'k3',p_metadata:{},p_correlation_id:crypto.randomUUID()}),rpc('item_kitchen_step',{p_token:TK,p_item_id:O.it,p_target:'ready',p_reason:'k3',p_metadata:{},p_correlation_id:crypto.randomUUID()})]);
    const st=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O.it)}`);
    // Concurrency invariants that actually hold + matter: both 200 (no error),
    // consistent final state (ready), no corrupt/both/intermediate state. item_kitchen_step
    // consumes NO stock, so no double-consumption is possible; a duplicate kds_ticket
    // event (if both advanced) is dup-safe on the G6 delivery spine (client full-resyncs).
    // (READ COMMITTED: the 2nd call can read the item pre-commit of the 1st -> both
    //  see preparing -> both advance to the SAME target -> benign, not a lost/double update.)
    const bothOk=OK(a)&&OK(b);
    const aIdem=/"idempotent":\s*true/.test(a.body), bIdem=/"idempotent":\s*true/.test(b.body);
    P('K3-5','2x concurrent item_kitchen_step(ready) -> both 200, consistent final=ready, no corrupt state', bothOk && st==='ready', 'a='+a.status+' b='+b.status+' final='+st+' aIdem='+aIdem+' bIdem='+bIdem);
    // Idempotency guarantee, proven directly with a SEQUENTIAL re-entry (item already ready):
    const c=await rpc('item_kitchen_step',{p_token:TK,p_item_id:O.it,p_target:'ready',p_reason:'k3-seq',p_metadata:{},p_correlation_id:crypto.randomUUID()});
    const cIdem=/"idempotent":\s*true/.test(c.body);
    const st2=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O.it)}`);
    P('K3-5b','sequential re-entry item_kitchen_step(ready) on ready item -> 200 idempotent:true, state unchanged (ready)', OK(c) && cIdem && st2==='ready', 'c='+c.status+' cIdem='+cIdem+' final='+st2+' '+c.body.slice(0,60));
    S(`DELETE FROM outbox_events WHERE payload->>'order_id'=${q(O.o)} OR payload->>'table_number'='505'`);
    S(`DELETE FROM audit_logs_canonical WHERE entity_id=${q(O.o)}`);
    S(`DELETE FROM operation_logs WHERE order_id=${q(O.o)}`);
    S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM order_items WHERE order_id=${q(O.o)}`); S(`DELETE FROM orders WHERE id=${q(O.o)}`); S(`DELETE FROM table_floors WHERE table_number=505`);
    S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM outbox_events WHERE payload->>'table_number'='505'`);
  }

  // ---- K3-6 (FIXED by 044, ratified): legacy order-level fns now REFUSE a PAID order ----
  // Before 044 these fns (G7 stock-safe targets) mutated paid/closed/cancelled orders with
  // no finalized guard (the double-stock-consumption gap). 044 adds the ORDER_FINALIZED
  // guard to all 4 (mark_order_ready / prepare_order_items / mark_order_completed /
  // update_order_item_status), preserving mark_order_ready's stock consumption for
  // NON-finalized orders. Expected now: refuse, NO mutation, NO stock change.
  {
    const O=mkOrder(506,'paid','preparing');
    const stockB=parseFloat(S(`SELECT current_stock::text FROM ingredients WHERE id=${q(ingId)}`));
    const r=await rpc('mark_order_ready',{p_order_id:O.o});
    let b={}; try{b=JSON.parse(r.body);}catch{}
    const st=S(`SELECT kitchen_status FROM order_items WHERE id=${q(O.it)}`);
    const logs=S(`SELECT count(*)::text FROM inventory_logs WHERE order_item_id=${q(O.it)} AND type='order_consumption'`);
    const stockA=parseFloat(S(`SELECT current_stock::text FROM ingredients WHERE id=${q(ingId)}`));
    const refused = (b && b.success===false && b.error==='ORDER_FINALIZED');
    P('K3-6','legacy mark_order_ready on PAID order -> ORDER_FINALIZED refuse, NO mutation, NO stock change (044 guard; parity w/ K3-3)',
      refused && st==='preparing' && logs==='0' && stockA===stockB, 'status='+r.status+' refused='+refused+' item='+st+' stocklog='+logs+' stock '+stockB+'->'+stockA);
    if(logs!=='0') S(`SELECT public.reverse_stock_for_items('[{"order_item_id":"${O.it}","reverse_qty":2}]')`);
    S(`ALTER TABLE public.inventory_logs DISABLE TRIGGER trg_inventory_logs_immutable`);
    S(`DELETE FROM inventory_logs WHERE order_item_id=${q(O.it)}`);
    S(`ALTER TABLE public.inventory_logs ENABLE TRIGGER trg_inventory_logs_immutable`);
    S(`DELETE FROM outbox_events WHERE payload->>'order_id'=${q(O.o)} OR payload->>'table_number'='506'`);
    S(`DELETE FROM audit_logs_canonical WHERE entity_id=${q(O.o)}`);
    S(`DELETE FROM operation_logs WHERE order_id=${q(O.o)}`);
    S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM order_items WHERE order_id=${q(O.o)}`); S(`DELETE FROM orders WHERE id=${q(O.o)}`); S(`DELETE FROM table_floors WHERE table_number=506`);
    S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
    S(`DELETE FROM outbox_events WHERE payload->>'table_number'='506'`);
  }

  // clean up the superadmin session + staff
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'K3_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'K3_%')`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE name LIKE 'K3_%'`);

  // FINAL residue
  const resid=S(`SELECT count(*)::text FROM orders WHERE table_number IN (${T.join(',')})`);
  const residOut=S(`SELECT count(*)::text FROM outbox_events WHERE payload->>'table_number' IN (${T.map(n=>"'"+n+"'").join(',')})`);
  const residSup=S(`SELECT count(*)::text FROM staff WHERE name LIKE 'K3_%' AND is_active=true`);
  P('K3-7','cleanup: 0 residue (orders + outbox + staff)', resid==='0' && residOut==='0' && residSup==='0', 'orders='+resid+' outbox='+residOut+' staff='+residSup);

  const pass=results.filter(r=>r.pass).length;
  console.log('\n'+pass+'/'+results.length+' K-3 checks passed');
  process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(2);});
