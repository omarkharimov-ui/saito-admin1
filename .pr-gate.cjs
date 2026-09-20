// PRINT ROUTING GATE (Wave A #5, pr v1) — route-level E2E via :3000 + DB proofs.
// Run: node .pr-gate.cjs   (dev :3000, solo)
// Fixture prefix PRG_ — zero-residue teardown.
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='prgate_csrf';
function http(path,body,token,method){method=method||'GET';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));if(body!==undefined&&body!==null)r.write(JSON.stringify(body));r.end();});}
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
  const MARK='PRG_'+crypto.randomBytes(2).toString('hex').toUpperCase();
  const ADM=crypto.randomUUID(), ADM_TOK=crypto.randomUUID();
  const MGR=crypto.randomUUID(), MGR_TOK=crypto.randomUUID();
  const CASH=crypto.randomUUID(), CASH_TOK=crypto.randomUUID();
  const LOC=S(`SELECT id FROM locations LIMIT 1`);
  const ROLE_ADMIN=S(`SELECT id FROM roles WHERE name='admin'`);
  const ROLE_MGR=S(`SELECT id FROM roles WHERE name='manager'`);
  const ROLE_CASH=S(`SELECT id FROM roles WHERE name='cashier'`);
  const D1N=`${MARK}_POS`, D2N=`${MARK}_KITCHEN`, D3N=`${MARK}_LABEL`;
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(ADM)},'PR_ADM','PR_ADM',${q(ROLE_ADMIN)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)}),(${q(MGR)},'PR_MGR','PR_MGR',${q(ROLE_MGR)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)}),(${q(CASH)},'PR_CASH','PR_CASH',${q(ROLE_CASH)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) SELECT s.id, ${q(LOC)}, true, true, ${q(ORG)} FROM staff s WHERE s.id IN (${q(ADM)},${q(MGR)},${q(CASH)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id) VALUES (${q(ADM_TOK)},${q(ADM)},'admin',now()+interval '2h','ACTIVE',${q(ORG)}),(${q(MGR_TOK)},${q(MGR)},'manager',now()+interval '2h','ACTIVE',${q(ORG)}),(${q(CASH_TOK)},${q(CASH)},'cashier',now()+interval '2h','ACTIVE',${q(ORG)})`);
  console.log(`PR FIXTURES: LOC=${LOC} adm=${ADM} mgr=${MGR} cash=${CASH} D1=${D1N} D2=${D2N}`);

  // ── device registry ───────────────────────────────────────────────────────
  let o=await httpR('/api/print/devices',{location_id:LOC,name:D1N,doc_types:['receipt'],iface:'browser',paper_width:'80mm',copies:1,enabled:true},ADM_TOK,'POST');
  const D1=o.data?.device?.id||'';
  const K1=o.data?.agent_key||'';
  R('P1','create browser device → success + agent_key (48 hex)',o.status===200&&o.data?.success===true&&D1!==''&&/^[0-9a-f]{48}$/.test(K1),`http=${o.status} body=${o.body.slice(0,200)}`);

  o=await httpR('/api/print/devices',{location_id:LOC,name:D2N,doc_types:['kitchen'],iface:'escpos_network',host:'192.168.1.50',port:9100,paper_width:'58mm',copies:2,enabled:true},ADM_TOK,'POST');
  const D2=o.data?.device?.id||'';
  const K2=o.data?.agent_key||'';
  R('P2','create network device → success + agent_key',o.status===200&&o.data?.success===true&&D2!==''&&/^[0-9a-f]{48}$/.test(K2),`http=${o.status} body=${o.body.slice(0,200)}`);

  o=await httpR('/api/print/devices',{location_id:LOC,name:D1N,doc_types:['receipt'],iface:'browser',copies:2,enabled:true},ADM_TOK,'POST');
  R('P3','upsert existing (copies 1→2) → success + agent_key NOT re-issued',o.status===200&&o.data?.success===true&&o.data?.agent_key==null&&o.data?.device?.copies===2,`http=${o.status} body=${o.body.slice(0,200)}`);

  o=await httpR('/api/print/devices',null,ADM_TOK);
  const dl=o.data?.devices||[];
  R('P4','list → 2 devices, NO agent_key field',o.status===200&&dl.length===2&&dl.every(d=>!('agent_key' in d)),`http=${o.status} n=${dl.length} keys=${JSON.stringify(dl.map(d=>d.agent_key))}`);

  o=await httpR(`/api/print/devices/${D2}`,{enabled:false},ADM_TOK,'PATCH');
  const D2off=o.status===200&&o.data?.success===true&&o.data?.device?.enabled===false;
  o=await httpR(`/api/print/devices/${D2}`,{enabled:true},ADM_TOK,'PATCH');
  R('P5','patch enabled off→on → success',D2off&&o.status===200&&o.data?.success===true&&o.data?.device?.enabled===true,`http=${o.status} body=${o.body.slice(0,200)}`);

  o=await httpR(`/api/print/devices/${D1}`,{copies:99},ADM_TOK,'PATCH');
  R('P6','patch copies=99 → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,140)}`);
  o=await httpR(`/api/print/devices/${D1}`,{doc_types:['bogus']},ADM_TOK,'PATCH');
  R('P6b','patch doc_types=bogus → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,140)}`);
  o=await httpR('/api/print/devices',{location_id:LOC,name:`${MARK}_PORT`,doc_types:['kitchen'],iface:'escpos_network',host:'1.2.3.4',port:99999,paper_width:'80mm',copies:1,enabled:true},ADM_TOK,'POST');
  R('P6c','create device port=99999 → clean 400 (E2E r1 #2 — no raw 23514)',o.status===400&&/port must be 1-65535/i.test(o.body),`http=${o.status} body=${o.body.slice(0,160)}`);

  o=await httpR('/api/print/devices',{location_id:LOC,name:`${MARK}_M`,doc_types:['receipt'],iface:'browser'},MGR_TOK,'POST');
  R('P7','manager device create → 403 (settings.admin)',o.status===403,`http=${o.status}`);
  o=await httpR('/api/print/devices',{location_id:LOC,name:`${MARK}_C`,doc_types:['receipt'],iface:'browser'},CASH_TOK,'POST');
  R('P8','cashier device create → 403',o.status===403,`http=${o.status}`);
  o=await http('/api/print/devices');
  R('P9','unauth device list → 401',o.status===401,`http=${o.status}`);

  // ── enqueue + routing + idempotency ───────────────────────────────────────
  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'label',trigger_key:'gate-label',payload:{}},CASH_TOK,'POST');
  const nLbl=S(`SELECT count(*) FROM print_jobs WHERE doc_type='label' AND created_at > ${q(T0)}`);
  R('P10','enqueue label (no label device) → routed:false, no job',o.status===200&&o.data?.success===true&&o.data?.routed===false&&nLbl==='0',`http=${o.status} body=${o.body.slice(0,160)} db=${nLbl}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'receipt',trigger_key:'g-r1',payload:{table:'A1',total:12.5,items:[{name:'Coffee',qty:1,price:5}]}},CASH_TOK,'POST');
  const J1=(S(`SELECT id FROM print_jobs WHERE trigger_key='g-r1' AND created_at > ${q(T0)}`));
  const J1st=S(`SELECT status||'|'||device_id||'|'||(claimed_by IS NULL)::int FROM print_jobs WHERE id=${q(J1)}`);
  R('P11','enqueue receipt → routed to browser device, queued',o.status===200&&o.data?.routed===true&&J1!==''&&J1st==='queued|'+D1+'|1',`http=${o.status} db=${J1st}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'receipt',trigger_key:'g-r1'},CASH_TOK,'POST');
  const nR1=S(`SELECT count(*) FROM print_jobs WHERE trigger_key='g-r1' AND created_at > ${q(T0)}`);
  R('P12','duplicate enqueue (same trigger) → duplicate:true, still 1 job',o.status===200&&o.data?.duplicate===true&&nR1==='1',`http=${o.status} body=${o.body.slice(0,160)} db=${nR1}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'receipt',order_id:crypto.randomUUID(),trigger_key:'g-r2'},CASH_TOK,'POST');
  R('P13','enqueue with nonexistent order → 400',o.status===400&&/order not found/i.test(o.body),`http=${o.status} body=${o.body.slice(0,140)}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'bogus',trigger_key:'g-r3'},CASH_TOK,'POST');
  R('P14','bad doc_type → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,140)}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'kitchen',trigger_key:'g-k1',payload:{order:1,items:[{name:'Soup',qty:2,price:4}]}},CASH_TOK,'POST');
  const KJ1=(S(`SELECT id FROM print_jobs WHERE trigger_key='g-k1' AND created_at > ${q(T0)}`));
  const KJ1st=S(`SELECT status||'|'||device_id FROM print_jobs WHERE id=${q(KJ1)}`);
  R('P15','enqueue kitchen → routed to NETWORK device',o.status===200&&o.data?.routed===true&&KJ1st==='queued|'+D2,`http=${o.status} db=${KJ1st}`);

  await httpR(`/api/print/devices/${D2}`,{enabled:false},ADM_TOK,'PATCH');
  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'kitchen',trigger_key:'g-k2'},CASH_TOK,'POST');
  const nK2=S(`SELECT count(*) FROM print_jobs WHERE trigger_key='g-k2' AND created_at > ${q(T0)}`);
  R('P16','kitchen with device DISABLED → routed:false, no job',o.status===200&&o.data?.routed===false&&nK2==='0',`http=${o.status} body=${o.body.slice(0,140)} db=${nK2}`);
  await httpR(`/api/print/devices/${D2}`,{enabled:true},ADM_TOK,'PATCH');

  // ── terminal claim (browser jobs only, atomic) ────────────────────────────
  o=await httpR('/api/print/claim',{location_id:LOC,terminal_id:'termA'},CASH_TOK,'POST');
  const cj=o.data?.jobs||[];
  const clSt=S(`SELECT claimed_by||'|'||status FROM print_jobs WHERE id=${q(J1)}`);
  R('P17','claim termA → gets the browser receipt job (not the kitchen one)',o.status===200&&cj.length===1&&cj[0].id===J1&&cj[0].device?.iface==='browser'&&clSt==='termA|claimed',`http=${o.status} n=${cj.length} db=${clSt}`);

  o=await httpR('/api/print/claim',{location_id:LOC,terminal_id:'termB'},CASH_TOK,'POST');
  R('P18','claim termB → no double-claim (0 jobs)',o.status===200&&(o.data?.jobs||[]).length===0,`http=${o.status} n=${(o.data?.jobs||[]).length}`);

  o=await httpR('/api/print/result',{job_id:J1,terminal_id:'termA',success:true},CASH_TOK,'POST');
  const prSt=S(`SELECT status||'|'||(printed_at IS NOT NULL)::int FROM print_jobs WHERE id=${q(J1)}`);
  R('P19','result(termA, success) → printed + printed_at',o.status===200&&o.data?.success===true&&prSt==='printed|1',`http=${o.status} db=${prSt}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'receipt',trigger_key:'g-r4'},CASH_TOK,'POST');
  const J4=S(`SELECT id FROM print_jobs WHERE trigger_key='g-r4' AND created_at > ${q(T0)}`);
  await httpR('/api/print/claim',{location_id:LOC,terminal_id:'termA'},CASH_TOK,'POST');
  o=await httpR('/api/print/result',{job_id:J4,terminal_id:'termB',success:true},CASH_TOK,'POST');
  R('P20','result by OTHER terminal → 400 (not your claimed job)',o.status===400&&/not your claimed/i.test(o.body),`http=${o.status} body=${o.body.slice(0,140)}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'receipt',trigger_key:'g-r5'},CASH_TOK,'POST');
  const J5=S(`SELECT id FROM print_jobs WHERE trigger_key='g-r5' AND created_at > ${q(T0)}`);
  o=await httpR('/api/print/result',{job_id:J5,terminal_id:'termA',success:false,error:'never claimed'},CASH_TOK,'POST');
  R('P21','result on QUEUED (unclaimed) job → 400',o.status===400&&/queued/i.test(o.body),`http=${o.status} body=${o.body.slice(0,140)}`);

  // ── agent poll (network device) ───────────────────────────────────────────
  o=await http('/api/print/agent/poll',{device_key:'deadbeefcafebabe'},null,'POST');
  R('P22','agent poll wrong key → 401 unknown device',o.status===401&&/unknown device/i.test(o.body),`http=${o.status} body=${o.body.slice(0,140)}`);

  await httpR(`/api/print/devices/${D2}`,{enabled:false},ADM_TOK,'PATCH');
  o=await http('/api/print/agent/poll',{device_key:K2},null,'POST');
  R('P23','agent poll DISABLED device → success, enabled:false, 0 jobs',o.status===200&&o.data?.success===true&&o.data?.enabled===false&&Array.isArray(o.data?.jobs)&&o.data.jobs.length===0,`http=${o.status} body=${o.body.slice(0,160)}`);
  await httpR(`/api/print/devices/${D2}`,{enabled:true},ADM_TOK,'PATCH');

  o=await http('/api/print/agent/poll',{device_key:K2},null,'POST');
  const aj=o.data?.jobs||[];
  const kSt=S(`SELECT status||'|'||claimed_by FROM print_jobs WHERE id=${q(KJ1)}`);
  R('P24','agent poll enabled → claims ONLY its device job (g-k1), not term jobs',o.status===200&&o.data?.enabled===true&&aj.length===1&&aj[0].id===KJ1&&kSt==='claimed|agent:'+D2N,`http=${o.status} n=${aj.length} db=${kSt}`);

  o=await http('/api/print/agent/poll',{action:'result',job_id:KJ1,success:true},null,'POST');
  const d2hb=S(`SELECT status||'|'||(last_seen_at IS NOT NULL)::int||'|'||online::int FROM print_devices d JOIN print_jobs j ON j.device_id=d.id WHERE j.id=${q(KJ1)}`);
  R('P25','agent result success → printed + device heartbeat (last_seen, online)',o.status===200&&o.data?.success===true&&d2hb==='printed|1|1',`http=${o.status} db=${d2hb}`);

  o=await httpR('/api/print/enqueue',{location_id:LOC,doc_type:'kitchen',trigger_key:'g-k3'},CASH_TOK,'POST');
  const KJ3=S(`SELECT id FROM print_jobs WHERE trigger_key='g-k3' AND created_at > ${q(T0)}`);
  await http('/api/print/agent/poll',{device_key:K2},null,'POST');
  o=await http('/api/print/agent/poll',{action:'result',job_id:KJ3,success:false,error:'paper jam'},null,'POST');
  const d2err=S(`SELECT j.status||'|'||coalesce(d.last_error,'null') FROM print_jobs j JOIN print_devices d ON d.id=j.device_id WHERE j.id=${q(KJ3)}`);
  R('P26','agent result failed → job failed + device last_error',o.status===200&&d2err==='failed|paper jam',`http=${o.status} db=${d2err}`);

  o=await httpR(`/api/print/devices/${D2}/rotate-key`,null,ADM_TOK,'POST');
  const K2B=o.data?.agent_key||'';
  const oA=await http('/api/print/agent/poll',{device_key:K2},null,'POST');
  const oB=await http('/api/print/agent/poll',{device_key:K2B},null,'POST');
  R('P27','key rotation → old key 401, new key works',o.status===200&&/^[0-9a-f]{48}$/.test(K2B)&&oA.status===401&&oB.status===200&&oB.data?.success===true,`http=${o.status}/${oA.status}/${oB.status} body=${o.body.slice(0,140)}`);

  // ── delete guards + queue counts ─────────────────────────────────────────
  o=await httpR(`/api/print/devices/${D1}`,null,ADM_TOK,'DELETE');
  R('P28','delete device with open job (g-r5 queued) → 400',o.status===400&&/open job/i.test(o.body),`http=${o.status} body=${o.body.slice(0,160)}`);

  o=await httpR('/api/print/devices',{location_id:LOC,name:D3N,doc_types:['label'],iface:'browser'},ADM_TOK,'POST');
  const D3=o.data?.device?.id||'';
  o=await httpR(`/api/print/devices/${D3}`,null,ADM_TOK,'DELETE');
  R('P29','delete device without jobs → success',o.status===200&&o.data?.success===true,`http=${o.status} body=${o.body.slice(0,140)}`);

  o=await httpR('/api/print/queue?terminal_id=termA',null,CASH_TOK);
  const qb=S(`SELECT (SELECT count(*) FROM print_jobs p JOIN print_devices d ON d.id=p.device_id WHERE d.name LIKE ${q(MARK+'%')} AND p.status='queued')||'|'||(SELECT count(*) FROM print_jobs WHERE claimed_by='termA' AND status='claimed' AND created_at > ${q(T0)})`);
  R('P30','queue counts match DB',o.status===200&&String(o.data?.queued)+'|'+String(o.data?.claimed_mine)===qb,`http=${o.status} api=${o.data?.queued}|${o.data?.claimed_mine} db=${qb}`);

  // ── grants + audit ────────────────────────────────────────────────────────
  const g=S(`SELECT 'anon='||coalesce(bool_or(has_function_privilege('anon',p.oid,'EXECUTE')),false)||' auth='||coalesce(bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE')),false)||' svc='||bool_and(has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'print_%' OR p.proname LIKE '_print_%')`);
  R('P31','grants: anon/auth NO EXECUTE, service_role ALL (OID sweep)',g==='anon=false auth=false svc=true',g);

  const aud=S(`SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit_logs_canonical WHERE action LIKE 'print_%' AND created_at > ${q(T0)}`);
  R('P32','audit: device + enqueue + result actions recorded',/print_device_upsert/.test(aud)&&/print_device_patch/.test(aud)&&/print_device_delete/.test(aud)&&/print_device_rotate_key/.test(aud)&&/print_enqueue/.test(aud)&&/print_result/.test(aud),`actions=${aud}`);

  // ── teardown (zero residue) ───────────────────────────────────────────────
  S(`DELETE FROM print_jobs WHERE device_id IN (SELECT id FROM print_devices WHERE name LIKE ${q(MARK+'%')})`);
  S(`DELETE FROM print_devices WHERE name LIKE ${q(MARK+'%')}`);
  S(`DELETE FROM sessions WHERE token IN (${q(ADM_TOK)},${q(MGR_TOK)},${q(CASH_TOK)})`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (${q(ADM)},${q(MGR)},${q(CASH)})`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE id IN (${q(ADM)},${q(MGR)},${q(CASH)})`);
  const resid=S(`SELECT (SELECT count(*) FROM print_devices WHERE name LIKE ${q(MARK+'%')})||'/'||(SELECT count(*) FROM print_jobs p JOIN print_devices d ON d.id=p.device_id WHERE d.name LIKE ${q(MARK+'%')})||'/'||(SELECT count(*) FROM staff WHERE id IN (${q(ADM)},${q(MGR)},${q(CASH)}) AND (is_active OR status<>'INACTIVE'))||'/'||(SELECT count(*) FROM sessions WHERE token IN (${q(ADM_TOK)},${q(MGR_TOK)},${q(CASH_TOK)}))`);
  R('P33','teardown → zero residue (devices/jobs/staff/sessions)',resid==='0/0/0/0',resid);

  console.log(`\nPR GATE: ${PASS} pass / ${FAIL} fail`);
  process.exit(FAIL?1:0);
 }catch(err){console.error('HARNESS FAILURE:',err.message);process.exit(2);}
})();
