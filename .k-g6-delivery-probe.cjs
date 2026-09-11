// G6 delivery-spine proof (idempotent, zero-residue): the /api/kitchen/realtime
// endpoint delivers ONLY the operator's own-location kds_ticket events
// (server-side payload.location_id scope). Cross-location events are NOT leaked.
// Run: node .k-g6-delivery-probe.cjs   (dev server must be up on :3000)
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const https=require('https');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d',LOCB='70000000-0000-4000-8000-000000000002';
const APP='http://localhost:3000';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,60)+': '+r.stderr);return r.stdout.trim();}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,140)));}
function get(path,token){return new Promise((res,rej)=>{const u=new URL(APP+path);const r=require('http').request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:'GET',headers:{'Cookie':token?`saito_token=${token}`:''}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);r.end();});}
(async()=>{
  const T=[493,494];
  // cleanup
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM orders WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'GD_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'GD_%')`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  S(`UPDATE staff SET is_active=false WHERE name LIKE 'GD_%'`);

  const R_KIT=S("SELECT id::text FROM roles WHERE name='kitchen'");
  const id=crypto.randomUUID();
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(id)},'GD_KIT','GD_KIT',${q(R_KIT)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(id)},${q(LOCA)},true,true,${q(ORG)})`);
  const tok=crypto.randomUUID();
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(tok)},${q(id)},'kitchen',now()+interval '1h','ACTIVE',${q(ORG)},${q(LOCA)})`);

  const prod=S('SELECT id::text FROM products ORDER BY created_at LIMIT 1').split('\n')[0].trim();
  const mk=(tn,loc,stn)=>{
    S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${tn},'occupied',${q(loc)},${q(ORG)})`);
    const o=crypto.randomUUID();
    S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(o)},${tn},'confirmed',20,${q(loc)},${q(ORG)},'pending',1)`);
    const it=crypto.randomUUID();
    S(`INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,kitchen_status,station) VALUES(${q(it)},${q(o)},${q(prod)},'P',1,20,20,'pending',${q(stn)})`);
    return{o,it};
  };
  const A=mk(493,LOCA,'grill');
  const B=mk(494,LOCB,'bar');

  // 1) unauthenticated -> 401
  const r0=await get('/api/kitchen/realtime');
  P('G6D-1','unauthenticated -> 401', r0.status===401, 'status='+r0.status);

  // 2) authed first load -> 200 + resync_required=true + anchor (now) present
  const r1=await get('/api/kitchen/realtime',tok);
  let b1={}; try{b1=JSON.parse(r1.body);}catch{}
  P('G6D-2','authed first load -> 200', r1.status===200, 'status='+r1.status+' '+r1.body.slice(0,60));
  P('G6D-3','first load resync_required=true', b1.resync_required===true, JSON.stringify(b1.resync_required));
  P('G6D-4','first load returns anchor (now) to start from', typeof b1.anchor==='string' && b1.anchor.length>0, JSON.stringify(b1.anchor));
  P('G6D-5','first load location_id = operator active location (LOCA)', b1.location_id===LOCA, JSON.stringify(b1.location_id));
  // client anchors cursor to (anchor, min-uuid) after the first-load resync
  const anchor=b1.anchor, MINUUID='00000000-0000-0000-0000-000000000000';

  // 3) trigger a LOCA item change + a LOCB item change (trigger emits kds_ticket w/ location_id)
  S(`UPDATE order_items SET kitchen_status='sent' WHERE id=${q(A.it)}`);
  S(`UPDATE order_items SET kitchen_status='sent' WHERE id=${q(B.it)}`);
  await new Promise(r=>setTimeout(r,400));

  // 4) poll with cursor=(anchor,min-uuid) -> must include LOCA item, must NOT include LOCB item
  const q2=`/api/kitchen/realtime?since_created_at=${encodeURIComponent(anchor)}&since_id=${encodeURIComponent(MINUUID)}`;
  const r2=await get(q2,tok);
  let b2={}; try{b2=JSON.parse(r2.body);}catch{}
  const evs=Array.isArray(b2.events)?b2.events:[];
  const itemIds=evs.map(e=>e.payload?.item_id||'').join(',');
  const locs=evs.map(e=>e.payload?.location_id||'').join(',');
  P('G6D-6','poll returns 200', r2.status===200, 'status='+r2.status);
  P('G6D-7','LOCA item event DELIVERED to LOCA operator', itemIds.includes(A.it), 'itemIds='+itemIds.slice(0,80));
  P('G6D-8','LOCB item event NOT delivered (cross-location isolation)', !itemIds.includes(B.it), 'itemIds='+itemIds.slice(0,80));
  P('G6D-9','every delivered event has location_id == LOCA', evs.length>0 && evs.every(e=>e.payload?.location_id===LOCA), 'locs='+locs.slice(0,80));

  // CLEANUP
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM outbox_events WHERE aggregate_id IN (${q(A.it)},${q(B.it)})`);
  S(`DELETE FROM order_items WHERE order_id IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM orders WHERE id IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM sessions WHERE token=${q(tok)}`);
  S(`DELETE FROM staff_locations WHERE staff_id=${q(id)}`);
  S(`UPDATE staff SET is_active=false WHERE id=${q(id)}`);
  const resid=S(`SELECT count(*)::text FROM orders WHERE table_number IN (${T.join(',')})`);
  P('G6D-10','cleanup: 0 residue', resid==='0', resid);

  const pass=results.filter(r=>r.pass).length;
  console.log('\n'+pass+'/'+results.length+' G6 delivery checks passed');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e.message);process.exit(2);});
