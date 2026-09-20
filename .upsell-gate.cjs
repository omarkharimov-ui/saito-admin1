// UPSELL GATE v2 (Wave B #3, map §21) — stateful offer engine contract.
// "Bu anda ən relevant olan bir şeyi, bir dəfə, düzgün anda təklif et."
// Run: node .upsell-gate.cjs   (dev :3000, solo)
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001';
const MROLE='bb579b8a-022d-4f89-99c7-56eebcec3032';
const SUPA='https://jbxmlnsicbfkbsatnoej.supabase.co';
const SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG1sbnNpY2Jma2JzYXRub2VqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjUwOTk3MywiZXhwIjoyMDkyMDg1OTczfQ.oPt6o5u6WNuVoR4hPzLKS3ICUDStOh__MVOiCT7cqnI';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='upsgate2_csrf';
function http(path,body,token,method){method=method||'GET';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));if(body!==undefined)r.write(JSON.stringify(body));r.end();});}
const transErr=o=>!o||o.status===0||/ERR |ECONNRESET|socket hang up|client-timeout/i.test(o.body||'');
async function httpR(path,body,token,method){let last;for(let i=0;i<4;i++){last=await http(path,body,token,method);if(!transErr(last))return last;await sleep(700*(i+1));}return last;}
async function rpc(args){const r=await fetch(`${SUPA}/rest/v1/rpc/suggest_addons_v2`,{method:'POST',headers:{apikey:SKEY,Authorization:`Bearer ${SKEY}`,'Content-Type':'application/json'},body:JSON.stringify(args)});const j=await r.json().catch(()=>null);return {status:r.status,list:Array.isArray(j)?j:null};}
let PASS=0,FAIL=0;
function R(id,name,ok,ev){
  if(ok)PASS++;else FAIL++;
  console.log((ok?'  PASS        ':'!!! FAIL      ')+id+' '+name+(ok?'':'\n   -> '+String(ev).slice(0,400)));
}
(async()=>{
 try{
  const MGR=crypto.randomUUID(), TOK=crypto.randomUUID();
  const MARK='UPG_'+crypto.randomBytes(2).toString('hex').toUpperCase();
  const CAT_F=crypto.randomUUID(), CAT_D=crypto.randomUUID();
  const PA=crypto.randomUUID(), PB=crypto.randomUUID(), PC=crypto.randomUUID(), PD=crypto.randomUUID();
  const PE=crypto.randomUUID(), PF=crypto.randomUUID();
  const LOC=S(`SELECT id::text FROM locations LIMIT 1`);
  const ORDER_IDS=[];

  S(`ALTER TABLE orders DISABLE TRIGGER trg_order_table_location`);
  S(`ALTER TABLE orders DISABLE TRIGGER trg_orders_sync_table_floors`);

  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(MGR)},'UPG2_MGR','UPG2_MGR',${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES (${q(MGR)},${q(LOC)},true,true,${q(ORG)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(TOK)},${q(MGR)},'manager',now()+interval '2h','ACTIVE',${q(ORG)},${q(LOC)})`);
  S(`INSERT INTO categories(id,name,slug) VALUES (${q(CAT_F)},'${MARK}_FOOD_CAT','${MARK}_food'),(${q(CAT_D)},'${MARK}_ICE_CAT','${MARK}_ice')`);
  S(`INSERT INTO products(id,name,price,cost_price,is_active,is_in_stock,category_id) VALUES (${q(PA)},'${MARK}_A',10.00,NULL,true,true,${q(CAT_F)}),(${q(PB)},'${MARK}_B',20.00,NULL,true,true,${q(CAT_F)}),(${q(PC)},'${MARK}_C',15.00,NULL,true,true,${q(CAT_D)}),(${q(PD)},'${MARK}_D',5.00,NULL,true,true,${q(CAT_F)}),(${q(PE)},'${MARK}_E',25.00,NULL,true,false,${q(CAT_F)}),(${q(PF)},'${MARK}_F',30.00,NULL,false,true,${q(CAT_F)})`);
  const mkOrder=(status,created)=>{const id=crypto.randomUUID();S(`INSERT INTO orders (id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES (${q(id)},9711,'${status}',2,50,${q(LOC)},${q(ORG)},'pending',false,${created},now(),1)`);ORDER_IDS.push(id);return id;};
  const addItem=(oid,pid,qty=1,price=10)=>{S(`INSERT INTO order_items (id,order_id,product_id,quantity,unit_price,total_price,created_at) VALUES (${q(crypto.randomUUID())},${q(oid)},${q(pid)},${qty},${price},${qty*price},now())`);};
  // Window: n(A)=5 · together(D,A)=3→60% · together(B,A)=2→40% · together(D,B)=3/3→100% · together(A,B)=2/3→67%
  const O1=mkOrder('paid','now()'); addItem(O1,PA,1,10); addItem(O1,PB,1,20); addItem(O1,PD,2,5);
  const O2=mkOrder('paid','now()'); addItem(O2,PA,1,10); addItem(O2,PB,1,20); addItem(O2,PD,1,5);
  const O3=mkOrder('paid','now()'); addItem(O3,PA,1,10); addItem(O3,PD,1,5);
  const O4=mkOrder('paid','now()'); addItem(O4,PA,1,10);
  const O5=mkOrder('paid','now()'); addItem(O5,PD,1,5);  addItem(O5,PC,1,15);
  const O6=mkOrder('paid','now()'); addItem(O6,PB,1,20); addItem(O6,PD,1,5);
  const O7=mkOrder('paid','now()'); addItem(O7,PE,1,25);
  const O8=mkOrder('paid','now()'); addItem(O8,PE,1,25);
  const O9=mkOrder('paid','now()'); addItem(O9,PF,1,30); addItem(O9,PA,1,10);
  const O10=mkOrder('cancelled','now()'); addItem(O10,PA,1,10); addItem(O10,PB,1,20);
  const O11=mkOrder("paid","now() - interval '95 days'"); addItem(O11,PA,1,10); addItem(O11,PB,1,20);
  // Dedicated lifecycle orders (items irrelevant — client sends the cart set).
  // 'paid' status: excluded from the active-table partial index, so 9711 can be shared.
  const L1=mkOrder('paid','now()');
  const L2=mkOrder('paid','now()');
  const L3=mkOrder('paid','now()');
  console.log(`UPG2 FIXTURES: PA=${PA.slice(0,8)} PB=${PB.slice(0,8)} PC=${PC.slice(0,8)} PD=${PD.slice(0,8)} L1=${L1.slice(0,8)} L2=${L2.slice(0,8)} L3=${L3.slice(0,8)}`);
  const byName=l=>Object.fromEntries(l.map(s=>[s.name,s]));
  const sug=(pid,extra={})=>httpR('/api/upsell/suggest',{product_ids:pid,...extra},TOK,'POST');

  // ── UPG1: engine math (direct RPC) ──────────────────────────────────────
  let r=await rpc({p_cart:[PA],p_limit:6});
  let m=byName(r.list||[]);
  R('UPG1a','rpc [A] → top2 = D,B (co outranks global drink/popular)',r.status===200&&(r.list||[]).slice(0,2).every(s=>['complement'].includes(s.offer_type))&&(r.list||[])[0].product_id===PD&&(r.list||[])[1].product_id===PB,`list=${JSON.stringify((r.list||[]).slice(0,4).map(s=>s.product_id))}`);
  R('UPG1b','D: complement pct 60 ref=A',m[`${MARK}_D`]?.offer_type==='complement'&&m[`${MARK}_D`]?.pct===60&&m[`${MARK}_D`]?.ref_name===`${MARK}_A`,`D=${JSON.stringify(m[`${MARK}_D`])}`);
  R('UPG1c','B: complement pct 40',m[`${MARK}_B`]?.offer_type==='complement'&&m[`${MARK}_B`]?.pct===40,`B=${JSON.stringify(m[`${MARK}_B`])}`);
  R('UPG1d','C: beverage (no drink in cart)',m[`${MARK}_C`]?.offer_type==='beverage',`C=${JSON.stringify(m[`${MARK}_C`])}`);
  R('UPG1e','cart item never a candidate',!(r.list||[]).some(s=>s.product_id===PA),`ids=${JSON.stringify((r.list||[]).map(s=>s.product_id))}`);
  R('UPG1f','E(out-of-stock)+F(inactive) never surface',!(r.list||[]).some(s=>s.product_id===PE||s.product_id===PF),`ids=${JSON.stringify((r.list||[]).map(s=>s.product_id))}`);

  // ── UPG2: price-jump guard (cart max 5 → candidates ≤ 12.5) ────────────
  r=await rpc({p_cart:[PD],p_limit:6});
  R('UPG2a','rpc [D] → A present (10 ≤ 12.5)',(r.list||[]).some(s=>s.product_id===PA),`ids=${JSON.stringify((r.list||[]).map(s=>s.product_id))}`);
  R('UPG2b','rpc [D] → B(20) & C(15) blocked by 2.5× price jump',!(r.list||[]).some(s=>s.product_id===PB)&&!(r.list||[]).some(s=>s.product_id===PC),`ids=${JSON.stringify((r.list||[]).map(s=>s.product_id))}`);

  // ── UPG3: evidence threshold (min co pct 90 → no complement) ───────────
  r=await rpc({p_cart:[PA],p_limit:6,p_min_co_pct:90});
  R('UPG3','min_co_pct=90 → zero complement offers (D=60%,B=40% rejected)',!(r.list||[]).some(s=>s.offer_type==='complement'),`types=${JSON.stringify((r.list||[]).slice(0,5).map(s=>s.offer_type))}`);

  // ── UPG4: excluded list (memory of prior offers) ───────────────────────
  r=await rpc({p_cart:[PA],p_limit:6,p_excluded:[PD,PB]});
  R('UPG4','p_excluded=[D,B] → top = C (beverage 203)',(r.list||[]).length>0&&(r.list||[])[0].product_id===PC,`top=${JSON.stringify((r.list||[])[0])}`);

  // ── UPG5: window/status exclusion (cancelled + 95d must not count) ────
  r=await rpc({p_cart:[PA],p_limit:6});
  m=byName(r.list||[]);
  const nAwin=S("SELECT count(*) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id="+q(PA)+" AND o.status IN ('paid','closed','confirmed','served') AND o.created_at > now() - interval '90 days'");
  R('UPG5','B pct still 40 (n(A)=5) — cancelled/95d orders excluded',m[`${MARK}_B`]?.pct===40&&nAwin==='5',`B=${JSON.stringify(m[`${MARK}_B`])} nA=${nAwin}`);

  // ── UPG6: stateless route (no order_id) ────────────────────────────────
  let o=await sug([PA]);
  R('UPG6a','stateless route → single offer = top candidate (D)',o.status===200&&o.data?.offer?.product_id===PD&&o.data?.offer_id===null,`body=${o.body.slice(0,250)}`);
  R('UPG6b','stateless client_excluded filters (D out → B)',(await sug([PA],{client_excluded:[PD]})).data?.offer?.product_id===PB,`got=${JSON.stringify((await sug([PA],{client_excluded:[PD]})).data?.offer)}`);
  o=await sug('not-an-array');
  R('UPG6c','malformed product_ids → {offer:null, reason:empty_cart}',o.status===200&&o.data?.offer===null&&o.data?.reason==='empty_cart',`body=${o.body.slice(0,200)}`);

  // ── UPG7: stateful lifecycle on L1 ─────────────────────────────────────
  o=await sug([PA],{order_id:L1});
  const oid1=o.data?.offer_id;
  R('UPG7a','L1 first → offer D + offer_id + budget{shown:1}',o.status===200&&o.data?.offer?.product_id===PD&&!!oid1&&o.data?.budget?.shown===1,`body=${o.body.slice(0,300)}`);
  R('UPG7b','DB: 1 shown row, snapshot=PA',S(`SELECT count(*)||'|'||coalesce(min(cart_snapshot),'') FROM upsell_offers WHERE order_id=${q(L1)}`)===`1|${PA}`,`db=${S(`SELECT count(*)||'|'||coalesce(min(cart_snapshot),'') FROM upsell_offers WHERE order_id=${q(L1)}`)}`);
  // Resume: identical set + unresolved shown → same offer_id, no double count
  o=await sug([PA],{order_id:L1});
  R('UPG7c','refetch same set → resumed same offer_id, DB still 1 row',o.data?.resumed===true&&o.data?.offer_id===oid1&&S(`SELECT count(*) FROM upsell_offers WHERE order_id=${q(L1)}`)==='1',`body=${o.body.slice(0,250)}`);
  // Meaningful set change → next offer (D excluded by memory)
  o=await sug([PA,PB],{order_id:L1});
  const oid2=o.data?.offer_id;
  R('UPG7d','set change → NEW offer (not D, not PB)',o.data?.offer&&o.data?.offer.product_id!==PD&&o.data?.offer.product_id!==PB&&oid2&&oid2!==oid1,`body=${o.body.slice(0,300)}`);
  // Accept → budget locks (max 1 accepted)
  o=await httpR('/api/upsell/outcome',{offer_id:oid2,outcome:'accepted'},TOK,'POST');
  R('UPG7e','outcome accepted → 200 + DB resolved',o.status===200&&o.data?.ok===true&&S(`SELECT outcome FROM upsell_offers WHERE id=${q(oid2)}`)==='accepted',`db=${S(`SELECT outcome FROM upsell_offers WHERE id=${q(oid2)}`)}`);
  o=await sug([PA,PB,PC],{order_id:L1});
  R('UPG7f','after accept (even with set change) → offer null reason=budget',o.data?.offer===null&&o.data?.reason==='budget',`body=${o.body.slice(0,200)}`);
  o=await sug([PA,PB],{order_id:L1});
  R('UPG7g','resume gone (accepted) — still budget-locked',o.data?.offer===null&&o.data?.reason==='budget',`body=${o.body.slice(0,200)}`);

  // ── UPG8: dismiss lifecycle on L2 ──────────────────────────────────────
  o=await sug([PA],{order_id:L2});
  const oid3=o.data?.offer_id;
  R('UPG8a','L2 first → offer',o.status===200&&!!oid3,`body=${o.body.slice(0,200)}`);
  o=await httpR('/api/upsell/outcome',{offer_id:oid3,outcome:'dismissed'},TOK,'POST');
  R('UPG8b','outcome dismissed → DB resolved',o.status===200&&S(`SELECT outcome FROM upsell_offers WHERE id=${q(oid3)}`)==='dismissed',`db=${S(`SELECT outcome FROM upsell_offers WHERE id=${q(oid3)}`)}`);
  o=await sug([PA],{order_id:L2});
  R('UPG8c','same set within cooldown → null reason=cooldown_after_dismiss',o.data?.offer===null&&o.data?.reason==='cooldown_after_dismiss',`body=${o.body.slice(0,200)}`);
  o=await sug([PA,PB],{order_id:L2});
  R('UPG8d','set change lifts cooldown → new offer, NEVER the dismissed candidate',o.data?.offer===null||o.data?.offer.product_id!==S(`SELECT candidate_product_id::text FROM upsell_offers WHERE id=${q(oid3)}`),`body=${o.body.slice(0,300)}`);

  // ── UPG9: shown-budget (max 2) on L3 ───────────────────────────────────
  o=await sug([PA],{order_id:L3});
  R('UPG9a','L3 offer #1',o.data?.offer!==null,`body=${o.body.slice(0,200)}`);
  o=await sug([PA,PB],{order_id:L3});
  R('UPG9b','L3 offer #2 after set change',o.data?.offer!==null,`body=${o.body.slice(0,200)}`);
  o=await sug([PA,PB,PC],{order_id:L3});
  R('UPG9c','L3 third → null reason=budget (shown≥2)',o.data?.offer===null&&o.data?.reason==='budget',`body=${o.body.slice(0,200)}`);

  // ── UPG10: security ────────────────────────────────────────────────────
  o=await http('/api/upsell/suggest',{product_ids:[PA]},null,'POST');
  R('UPG10a','unauth suggest → 401',o.status===401,`http=${o.status}`);
  o=await http('/api/upsell/outcome',{offer_id:oid3,outcome:'dismissed'},null,'POST');
  R('UPG10b','unauth outcome → 401',o.status===401,`http=${o.status}`);
  o=await httpR('/api/upsell/outcome',{offer_id:crypto.randomUUID(),outcome:'accepted'},TOK,'POST');
  R('UPG10c','outcome unknown id → 404',o.status===404,`http=${o.status}`);
  o=await httpR('/api/upsell/outcome',{offer_id:oid3,outcome:'banana'},TOK,'POST');
  R('UPG10d','outcome invalid value → 400',o.status===400,`http=${o.status}`);
  const g1=S(`SELECT has_function_privilege('anon','public.suggest_addons_v2(uuid[], integer, uuid[], numeric, integer)','EXECUTE')::text||'/'||has_function_privilege('authenticated','public.suggest_addons_v2(uuid[], integer, uuid[], numeric, integer)','EXECUTE')::text||'/'||has_function_privilege('service_role','public.suggest_addons_v2(uuid[], integer, uuid[], numeric, integer)','EXECUTE')::text`);
  R('UPG10e','v2 grants: anon/auth NO, service_role YES',g1==='false/false/true',`grants=${g1}`);
  const g2=S(`SELECT has_table_privilege('authenticated','public.upsell_offers','SELECT')::text||'/'||has_table_privilege('service_role','public.upsell_offers','SELECT')::text||'/'||has_table_privilege('service_role','public.upsell_offers','INSERT')::text`);
  R('UPG10f','table grants: authenticated NO SELECT, service_role SEL+INS',g2==='false/true/true',`grants=${g2}`);
  const anon=await fetch(`${SUPA}/rest/v1/rpc/suggest_addons_v2`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_cart:[PA],p_limit:6})});
  R('UPG10g','anon direct v2 RPC → 401/403',anon.status===401||anon.status===403,`http=${anon.status}`);

  // ── teardown (zero residue) ─────────────────────────────────────────────
  S(`ALTER TABLE orders ENABLE TRIGGER trg_order_table_location`);
  S(`ALTER TABLE orders ENABLE TRIGGER trg_orders_sync_table_floors`);
  S(`DELETE FROM upsell_offers WHERE order_id IN (${ORDER_IDS.map(q).join(',')})`);
  S(`DELETE FROM order_items WHERE order_id IN (${ORDER_IDS.map(q).join(',')})`);
  S(`DELETE FROM orders WHERE id IN (${ORDER_IDS.map(q).join(',')})`);
  S(`DELETE FROM products WHERE id IN (${[PA,PB,PC,PD,PE,PF].map(q).join(',')})`);
  S(`DELETE FROM categories WHERE id IN (${q(CAT_F)},${q(CAT_D)})`);
  S(`DELETE FROM sessions WHERE token=${q(TOK)}`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE id=${q(MGR)}`);
  const residue=S(`SELECT (SELECT count(*) FROM upsell_offers WHERE order_id IN (${ORDER_IDS.map(q).join(',')}))||'/'||(SELECT count(*) FROM orders WHERE id IN (${ORDER_IDS.map(q).join(',')}))||'/'||(SELECT count(*) FROM order_items WHERE order_id IN (${ORDER_IDS.map(q).join(',')}))||'/'||(SELECT count(*) FROM products WHERE id IN (${[PA,PB,PC,PD,PE,PF].map(q).join(',')}))||'/'||(SELECT count(*) FROM sessions WHERE token=${q(TOK)})||'/'||(SELECT count(*) FROM staff WHERE id=${q(MGR)} AND (is_active OR status<>'INACTIVE'))`);
  R('UPG11','teardown: zero residue (offers/orders/items/products/sessions/staff)',residue==='0/0/0/0/0/0',`residue=${residue}`);

  console.log(`\nUPSELL2 GATE: ${PASS} pass / ${FAIL} fail`);
  process.exit(FAIL>0?1:0);
 }catch(e){
  try{
   S(`ALTER TABLE orders ENABLE TRIGGER trg_order_table_location`);
   S(`ALTER TABLE orders ENABLE TRIGGER trg_orders_sync_table_floors`);
  }catch{}
  console.error('GATE CRASH:',e.message);
  console.log(`UPSELL2 GATE: ${PASS} pass / ${FAIL} fail + CRASH`);
  process.exit(2);
 }
})();
