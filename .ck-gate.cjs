// CHECKLISTS GATE (Wave A #5, map §21 J) — route-level E2E via :3000 + DB proofs.
// Run: node .ck-gate.cjs   (dev :3000, solo)
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001';
const MROLE='bb579b8a-022d-4f89-99c7-56eebcec3032', CASH_ROLE='945137c3-fc59-457e-abaa-c16ff8e9cee3';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='ckgate_csrf';
function http(path,body,token,method){method=method||'GET';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));if(body!==undefined)r.write(JSON.stringify(body));r.end();});}
const transErr=o=>!o||o.status===0||/ERR |ECONNRESET|socket hang up|client-timeout/i.test(o.body||'');
async function httpR(path,body,token,method){let last;for(let i=0;i<4;i++){last=await http(path,body,token,method);if(!transErr(last))return last;await sleep(700*(i+1));}return last;}

let PASS=0,FAIL=0;
function R(id,name,ok,ev){
  if(ok)PASS++;else FAIL++;
  console.log((ok?'  PASS        ':'!!! FAIL      ')+id+' '+name+(ok?'':'\n   -> '+String(ev).slice(0,400)));
}

(async()=>{
 try{
  const T0=S(`SELECT now()::text`);
  const MGR=crypto.randomUUID(), MGR_TOK=crypto.randomUUID();
  const CASH=crypto.randomUUID(), CASH_TOK=crypto.randomUUID();
  const MARK='CKG_'+crypto.randomBytes(2).toString('hex').toUpperCase();
  const T1=`${MARK}_OPEN`, T2=`${MARK}_MANUAL`, T3=`${MARK}_LATE`;
  const items3=[{title:'Cash count'},{title:'Fridge check',note:'< 4C'},{title:'Doors locked'}];
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(MGR)},'CK_MGR','CK_MGR',${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)}),(${q(CASH)},'CK_CASH','CK_CASH',${q(CASH_ROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) SELECT s.id, l.id, true, true, ${q(ORG)} FROM staff s, (SELECT id FROM locations LIMIT 1) l WHERE s.id IN (${q(MGR)},${q(CASH)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id) VALUES (${q(MGR_TOK)},${q(MGR)},'manager',now()+interval '2h','ACTIVE',${q(ORG)}),(${q(CASH_TOK)},${q(CASH)},'cashier',now()+interval '2h','ACTIVE',${q(ORG)})`);
  console.log(`CK FIXTURES: T1=${T1} T2=${T2} T3=${T3} mgr=${MGR} cash=${CASH}`);

  // ── templates ─────────────────────────────────────────────────────────────
  let o=await httpR('/api/checklists/templates',{title:T1,category:'opening',items:items3,scheduled_at:null,recurring:'daily'},MGR_TOK,'POST');
  const T1ID=o.data?.template?.id||'';
  R('C1','template create (daily) → success',o.status===200&&o.data?.success===true&&T1ID!==''&&Array.isArray(o.data?.template?.items)&&o.data.template.items.length===3,`http=${o.status} body=${o.body.slice(0,200)}`);

  o=await httpR('/api/checklists/templates',{title:T2,category:'closing',items:[{title:'Lights off'},{title:'Register close'}],recurring:'manual'},MGR_TOK,'POST');
  const T2ID=o.data?.template?.id||'';
  R('C2','template create (manual) → success',o.status===200&&T2ID!==''&&o.data?.template?.recurring==='manual',`http=${o.status}`);

  o=await httpR('/api/checklists/templates',{title:T3,category:'cleaning',items:[{title:'Deep clean'}],scheduled_at:'23:59',recurring:'daily'},MGR_TOK,'POST');
  R('C3','template create (daily 23:59) → success',o.status===200&&!!(o.data?.template?.id),`http=${o.status}`);

  o=await httpR('/api/checklists/templates',{title:'',category:'opening',items:[{title:'x'}]},MGR_TOK,'POST');
  R('C4a','empty title → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,120)}`);
  o=await httpR('/api/checklists/templates',{title:`${MARK}_BADCAT`,category:'nonsense',items:[{title:'x'}]},MGR_TOK,'POST');
  R('C4b','bad category → 400',o.status===400,`http=${o.status}`);
  o=await httpR('/api/checklists/templates',{title:`${MARK}_BADITEMS`,category:'opening',items:[]},MGR_TOK,'POST');
  R('C4c','empty items → 400',o.status===400,`http=${o.status}`);
  o=await httpR('/api/checklists/templates',{title:`${MARK}_NOTITLE`,category:'opening',items:[{note:'no title'}]},MGR_TOK,'POST');
  R('C4d','item without title → 400',o.status===400,`http=${o.status}`);
  o=await httpR('/api/checklists/templates',{title:T1.toUpperCase().slice(0,7)+`X${crypto.randomBytes(2).toString('hex').toUpperCase()}`,category:'closing',items:[{title:'x'}]},CASH_TOK,'POST');
  R('C5','cashier template create → 403',o.status===403,`http=${o.status}`);
  // dup title (case-insensitive) → clean 400, not 500 (000009 guard)
  o=await httpR('/api/checklists/templates',{title:t1upper(T1),category:'closing',items:[{title:'x'}]},MGR_TOK,'POST');
  R('C6','duplicate title (case-insens) → 400 not 500',o.status===400&&/already exists/i.test(o.body),`http=${o.status} body=${o.body.slice(0,140)}`);
  // template list (manager)
  o=await httpR('/api/checklists/templates',undefined,MGR_TOK);
  const tlist=Array.isArray(o.data)?o.data:[];
  R('C7','template list shows 3 fixtures',o.status===200&&tlist.filter(t=>t.title.startsWith(MARK)).length===3,`n=${tlist.length} body=${o.body.slice(0,140)}`);
  function t1upper(s){return s.replace(/[a-z]/g,c=>c.toUpperCase());}

  // ── board / materialization ───────────────────────────────────────────────
  o=await httpR('/api/checklists/board',undefined,MGR_TOK);
  let board=Array.isArray(o.data)?o.data:[];
  const b1=board.filter(r=>r.title.startsWith(MARK));
  R('C8','board: T1 materialized, T2 (manual) + T3 (23:59) NOT',o.status===200&&b1.length===1&&b1[0].source==='template'&&b1[0].items_total===3&&b1[0].status==='pending',`n=${b1.length} body=${o.body.slice(0,200)}`);
  const R1=b1[0]?.id||'';
  o=await httpR('/api/checklists/board',undefined,MGR_TOK);
  board=Array.isArray(o.data)?o.data:[];
  const b1b=board.filter(r=>r.title.startsWith(MARK));
  R('C9','board idempotent (same run, no dup)',b1b.length===1&&b1b[0]?.id===R1,`ids=${JSON.stringify(b1b.map(r=>r.id))}`);
  // unauth
  o=await http('/api/checklists/board',undefined,null);
  R('C10','board unauth → 401',o.status===401,`http=${o.status}`);

  // ── detail ────────────────────────────────────────────────────────────────
  o=await httpR(`/api/checklists/runs/${R1}`,undefined,MGR_TOK);
  R('C11','detail shape (run+3 items sorted)',o.status===200&&o.data?.id===R1&&Array.isArray(o.data?.checklist_run_items)&&o.data.checklist_run_items.length===3&&o.data.checklist_run_items[0].title==='Cash count',`body=${o.body.slice(0,200)}`);
  const I1=o.data?.checklist_run_items?.[0]?.id||'', I2=o.data?.checklist_run_items?.[1]?.id||'', I3=o.data?.checklist_run_items?.[2]?.id||'';
  o=await http(`/api/checklists/runs/${crypto.randomUUID()}`,undefined,MGR_TOK);
  R('C12','detail unknown → 404',o.status===404,`http=${o.status}`);

  // ── item toggles + run state machine ─────────────────────────────────────
  o=await httpR(`/api/checklists/runs/${R1}/items/${I1}`,{completed:true},CASH_TOK,'PATCH');
  const db1=S(`SELECT status, started_at IS NOT NULL AS st, (SELECT count(*) FROM checklist_run_items WHERE run_id=${q(R1)} AND completed) FROM checklist_runs WHERE id=${q(R1)}`);
  R('C13','item1 on (cashier OK) → in_progress + started_at',o.status===200&&o.data?.run?.status==='in_progress'&&db1==='in_progress\tt\t1',`http=${o.status} db=${db1}`);
  o=await httpR(`/api/checklists/runs/${R1}/items/${I2}`,{completed:true,note:'done 12:10'},MGR_TOK,'PATCH');
  o=await httpR(`/api/checklists/runs/${R1}/items/${I3}`,{completed:true},MGR_TOK,'PATCH');
  const db2=S(`SELECT status, completed_at IS NOT NULL AS fin FROM checklist_runs WHERE id=${q(R1)}`);
  R('C14','all items → completed + completed_at',o.status===200&&o.data?.run?.status==='completed'&&db2==='completed\tt',`http=${o.status} db=${db2}`);
  // note persisted?
  const note=S(`SELECT coalesce(note,'null') FROM checklist_run_items WHERE id=${q(I2)}`);
  R('C15','item proof note persisted',note==='done 12:10',`note=${note}`);
  // toggle off from completed → reopens in_progress
  o=await httpR(`/api/checklists/runs/${R1}/items/${I3}`,{completed:false},MGR_TOK,'PATCH');
  const db3=S(`SELECT status FROM checklist_runs WHERE id=${q(R1)}`);
  R('C16','uncheck from completed → in_progress (2/3)',o.status===200&&o.data?.run?.status==='in_progress'&&db3==='in_progress',`http=${o.status} db=${db3}`);
  o=await httpR(`/api/checklists/runs/${R1}/items/${I3}`,{completed:true},MGR_TOK,'PATCH');
  const db4=S(`SELECT status, completed_at IS NOT NULL AS fin FROM checklist_runs WHERE id=${q(R1)}`);
  R('C17','recheck → completed (completed_at kept)',o.status===200&&db4==='completed\tt',`db=${db4}`);
  // re-check on completed → rejected
  o=await httpR(`/api/checklists/runs/${R1}/items/${I1}`,{completed:true},MGR_TOK,'PATCH');
  R('C18','re-check on completed → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,120)}`);

  // ── manual run + assign + skip ───────────────────────────────────────────
  o=await httpR('/api/checklists/runs',{title:`${MARK}_ADHOC`,category:'manager',items:[{title:'Sign off'}, {title:'Count drawer'}],assigned_to:MGR,due_at:new Date(Date.now()-3600e3).toISOString()},MGR_TOK,'POST');
  const R2=o.data?.run?.id||'';
  R('C19','manual run create (assigned, past due)',o.status===200&&R2!==''&&Number(o.data?.run?.items_total)===2,`http=${o.status} body=${o.body.slice(0,160)}`);
  o=await httpR('/api/checklists/board',undefined,MGR_TOK);
  board=Array.isArray(o.data)?o.data:[];
  const r2=board.find(r=>r.id===R2);
  R('C20','board: overdue flag + assigned_name',!!r2&&r2.overdue===true&&r2.assigned_name==='CK_MGR'&&r2.assigned_to===MGR,`r2=${JSON.stringify(r2).slice(0,200)}`);
  // assign completed run → rejected
  o=await http(`/api/checklists/runs/${R1}`,{action:'assign',staff_id:CASH},MGR_TOK,'PATCH');
  R('C21','assign completed run → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,120)}`);
  // skip pending → skipped (+reason); item toggle on skipped rejected
  o=await http(`/api/checklists/runs/${R2}`,{action:'skip',reason:'closed early'},MGR_TOK,'PATCH');
  R('C22','skip pending → skipped + reason',o.status===200&&o.data?.run?.status==='skipped'&&o.data?.run?.skipped_reason==='closed early',`http=${o.status} body=${o.body.slice(0,160)}`);
  o=await http(`/api/checklists/runs/${R2}`,undefined,MGR_TOK);
  const I4=o.data?.checklist_run_items?.[0]?.id||'';
  o=await http(`/api/checklists/runs/${R2}/items/${I4}`,{completed:true},CASH_TOK,'PATCH');
  R('C23','toggle on skipped → 400 (unskip first)',o.status===400,`http=${o.status} body=${o.body.slice(0,140)}`);
  o=await http(`/api/checklists/runs/${R2}`,{action:'unskip'},MGR_TOK,'PATCH');
  R('C24','unskip → pending',o.status===200&&o.data?.run?.status==='pending',`http=${o.status}`);
  // start then skip → rejected
  o=await http(`/api/checklists/runs/${R2}/items/${I4}`,{completed:true},CASH_TOK,'PATCH');
  o=await http(`/api/checklists/runs/${R2}`,{action:'skip'},MGR_TOK,'PATCH');
  R('C25','skip in_progress → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,120)}`);
  // cashier PATCH run actions → 403
  o=await http(`/api/checklists/runs/${R2}`,{action:'skip'},CASH_TOK,'PATCH');
  R('C26','cashier run action → 403',o.status===403,`http=${o.status}`);

  // ── template update (copy-on-materialize) ─────────────────────────────────
  o=await httpR('/api/checklists/templates',{id:T1ID,title:T1,category:'opening',items:items3.slice(0,2),scheduled_at:null,recurring:'daily',is_active:true},MGR_TOK,'POST');
  R('C27','template update → 2 items (existing run keeps 3)',o.status===200&&o.data?.template?.items?.length===2&&S(`SELECT count(*) FROM checklist_run_items WHERE run_id=${q(R1)}`)==='3',`http=${o.status} db=${S(`SELECT count(*) FROM checklist_run_items WHERE run_id=${q(R1)}`)}`);

  // ── grants / audit ────────────────────────────────────────────────────────
  // NOTE: has_function_privilege(text form) is broken on this PG17 pooler
  // ("expected a left parenthesis") → OID form via pg_proc/pg_namespace.
  const grants=S(`SELECT (SELECT coalesce(bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')),false) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'checklist_%' OR p.proname='_checklist_normalize_items'))::text ||'/'|| has_table_privilege('anon','public.checklist_runs','INSERT')::text ||'/'|| (SELECT coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')),false) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'checklist_%' OR p.proname='_checklist_normalize_items'))::text`);
  const gTok=grants.split('/').map(x=>x.trim().toLowerCase());
  R('C28','grants: anon/auth no fn/table access',gTok.length===3&&gTok.every(x=>x!=='true'&&x!=='t'),`grants=${grants}`);
  const audit=S(`SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit_logs_canonical WHERE entity_type IN ('checklist_run','checklist_template') AND created_at > ${q(T0)}`);
  R('C29','audit: template+run actions recorded',/checklist_template_create/.test(audit||'')&&/checklist_item_toggle/.test(audit||'')&&/checklist_run_create/.test(audit||'')&&/checklist_run_skipped/.test(audit||''),`actions=${audit}`);

  // ── teardown (F-contract) ─────────────────────────────────────────────────
  S(`DELETE FROM checklist_runs WHERE title LIKE ${q(MARK+'%')}`);
  S(`DELETE FROM checklist_templates WHERE title LIKE ${q(MARK+'%')}`);
  S(`DELETE FROM sessions WHERE token IN (${q(MGR_TOK)},${q(CASH_TOK)})`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE id IN (${q(MGR)},${q(CASH)})`);
  const residue=S(`SELECT (SELECT count(*) FROM checklist_templates WHERE title LIKE ${q(MARK+'%')})||'/'||(SELECT count(*) FROM checklist_runs WHERE title LIKE ${q(MARK+'%')})||'/'||(SELECT count(*) FROM checklist_run_items i JOIN checklist_runs r ON r.id=i.run_id WHERE r.title LIKE ${q(MARK+'%')})||'/'||(SELECT count(*) FROM sessions WHERE token IN (${q(MGR_TOK)},${q(CASH_TOK)}))||'/'||(SELECT count(*) FROM staff WHERE id IN (${q(MGR)},${q(CASH)}) AND (is_active OR status<>'INACTIVE'))`);
  R('C30','teardown: zero residue',residue==='0/0/0/0/0',`residue=${residue}`);

  console.log(`\nCK GATE: ${PASS} pass / ${FAIL} fail`);
  process.exit(FAIL>0?1:0);
 }catch(e){
  console.error('GATE CRASH:',e.message);
  console.log(`CK GATE: ${PASS} pass / ${FAIL} fail + CRASH`);
  process.exit(2);
 }
})();
