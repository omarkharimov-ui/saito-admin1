// GC GATE — Wave A #3 gift card vertical (repair + lifecycle + report).
// Route-level E2E (real HTTP via :3000) + DB invariant proofs.
// Fixtures: manager staff+session, cashier staff+session, GC_-prefixed cards.
// Teardown: business rows deleted (ledger cascades); audit_logs_canonical
// rows KEPT (append-only audit trail — deleting audit = anti-pattern).
// Run: node .gc-gate.cjs   (dev :3000, solo)
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001';
const MROLE='bb579b8a-022d-4f89-99c7-56eebcec3032', CASH_ROLE='945137c3-fc59-457e-abaa-c16ff8e9cee3';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='gcgate_csrf';
function http(path,body,token,method){method=method||'GET';const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}return new Promise((res)=>{let done=false;const finish=o=>{if(!done){done=true;res(o);}};const r=require('http').request({hostname:'localhost',port:3000,path,method,headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}finish({status:resp.statusCode,data:j,body:d});});});r.on('timeout',()=>{try{r.destroy(new Error('client-timeout'));}catch{}});r.on('error',e=>finish({status:0,body:'ERR '+e.message}));if(body!==undefined)r.write(JSON.stringify(body));r.end();});}
const transErr=o=>!o||o.status===0||/ERR |ECONNRESET|socket hang up|client-timeout/i.test(o.body||'');
async function httpR(path,body,token,method){let last;for(let i=0;i<4;i++){last=await http(path,body,token,method);if(!transErr(last))return last;await sleep(700*(i+1));}return last;}

let PASS=0,FAIL=0; const results=[];
function R(id,name,ok,ev){
  if(ok)PASS++;else FAIL++;
  results.push({id,name,ok,evidence:String(ev).slice(0,320)});
  console.log((ok?'  PASS        ':'!!! FAIL      ')+id+' '+name+(ok?'':'\n   -> '+String(ev).slice(0,400)));
}

(async()=>{
try{
  // ── fixtures ──────────────────────────────────────────────────────────────
  const MGR=crypto.randomUUID(), MGR_TOK=crypto.randomUUID();
  const CASH=crypto.randomUUID(), CASH_TOK=crypto.randomUUID();
  const C1='GC_GATE_'+crypto.randomBytes(3).toString('hex').toUpperCase();
  const C2='GC_GATE_'+crypto.randomBytes(3).toString('hex').toUpperCase()+'B';
  const C3='GC_GATE_'+crypto.randomBytes(3).toString('hex').toUpperCase()+'C';
  const T0=S(`SELECT now()::text`); // fixed reference — sliding windows race
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(MGR)},'GC_MGR','GC_MGR',${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)}),(${q(CASH)},'GC_CASH','GC_CASH',${q(CASH_ROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) SELECT s.id, l.id, true, true, ${q(ORG)} FROM staff s, (SELECT id FROM locations LIMIT 1) l WHERE s.id IN (${q(MGR)},${q(CASH)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id) VALUES (${q(MGR_TOK)},${q(MGR)},'manager',now()+interval '2h','ACTIVE',${q(ORG)}),(${q(CASH_TOK)},${q(CASH)},'cashier',now()+interval '2h','ACTIVE',${q(ORG)})`);
  console.log(`GC FIXTURE: C1=${C1} C2=${C2} C3=${C3} t0=${T0}`);

  // G1 — summary shape (authenticated)
  let o=await httpR('/api/gift-cards/summary',undefined,MGR_TOK);
  R('G1','summary 200 + shape',o.status===200&&o.data&&typeof o.data.active_balance!=='undefined'&&typeof o.data.total_cards==='number',`status=${o.status} body=${o.body.slice(0,200)}`);

  // G2 — unauthenticated → 401 (all surfaces)
  o=await httpR('/api/gift-cards?status=active',undefined,null);
  const o2=await httpR('/api/gift-cards/summary',undefined,null);
  const o3=await httpR(`/api/gift-cards/${C1}/ledger`,undefined,null);
  const o4=await http(`/api/gift-cards/${C1}/block`,{unblock:false},null,'POST');
  R('G2','unauth 401 x4',[o,o2,o3,o4].every(x=>x.status===401),`list=${o.status} summary=${o2.status} ledger=${o3.status} block=${o4.status}`);

  // G3 — issue card C1 (manager)
  o=await httpR('/api/gift-cards',{code:C1,initial_balance:100,issued_to_name:'Gate C1',expires_at:null},MGR_TOK,'POST');
  R('G3','issue C1 100 → success',o.status===200&&o.data?.success===true&&Number(o.data?.balance)===100,`status=${o.status} body=${o.body.slice(0,200)}`);
  const C1ID=o.data?.card_id||'';

  // G4 — list contains C1 (status=active)
  o=await httpR(`/api/gift-cards?status=active&code=${C1}`,undefined,MGR_TOK);
  R('G4','list shows C1 active',o.status===200&&Array.isArray(o.data)&&o.data.length===1&&o.data[0].code===C1&&o.data[0].status==='active',`n=${Array.isArray(o.data)?o.data.length:'?'} body=${o.body.slice(0,160)}`);

  // G5 — ledger endpoint: 1 issue entry, chain start
  o=await httpR(`/api/gift-cards/${C1}/ledger?limit=50`,undefined,MGR_TOK);
  const e1=Array.isArray(o.data?.entries)?o.data.entries:[];
  R('G5','ledger C1 = 1 issue entry',o.status===200&&o.data?.card?.id===C1ID&&e1.length===1&&e1[0].type==='issue'&&Number(e1[0].amount)===100&&Number(e1[0].balance_after)===100,`status=${o.status} n=${e1.length} body=${o.body.slice(0,220)}`);

  // G6 — duplicate code → 400
  o=await httpR('/api/gift-cards',{code:C1.toLowerCase(),initial_balance:10},MGR_TOK,'POST');
  R('G6','dup code rejected 400',o.status===400&&/already exists/i.test(o.data?.error||''),`status=${o.status} body=${o.body.slice(0,160)}`);

  // G7 — partial redeem 30
  o=await httpR('/api/gift-cards/redeem',{code:C1,amount:30,order_id:null},MGR_TOK,'POST');
  R('G7','redeem 30 → remaining 70',o.status===200&&o.data?.success===true&&Number(o.data?.remaining_balance)===70,`status=${o.status} body=${o.body.slice(0,200)}`);

  // G8 — over-redeem → 400 insufficient
  o=await httpR('/api/gift-cards/redeem',{code:C1,amount:500},MGR_TOK,'POST');
  R('G8','over-redeem rejected',o.status===400&&/insufficient/i.test(o.data?.error||''),`status=${o.status} body=${o.body.slice(0,160)}`);

  // G9 — deplete to 0 → status 'used' (legal), NOT 'depleted'
  o=await httpR('/api/gift-cards/redeem',{code:C1,amount:70},MGR_TOK,'POST');
  const st1=S(`SELECT status FROM gift_cards WHERE code=${q(C1)}`);
  R('G9','deplete → status used',o.status===200&&st1==='used',`redeem=${o.status} db_status=${st1}`);

  // G10 — ledger chain: issue 100 → redeem 30 → redeem 70 (balance_after 100/70/0)
  o=await httpR(`/api/gift-cards/${C1}/ledger?limit=50`,undefined,MGR_TOK);
  const eC1=(Array.isArray(o.data?.entries)?o.data.entries:[]).slice().reverse();
  const chainOk=eC1.length===3&&eC1.every((e,i)=>Number(e.balance_after)===[100,70,0][i])&&eC1[1].type==='redeem'&&eC1[2].type==='redeem';
  R('G10','ledger chain 100→70→0',chainOk,`entries=${JSON.stringify(eC1.map(e=>[e.type,e.amount,e.balance_after]))}`);

  // G11 — loophole: block a USED card → rejected
  o=await httpR(`/api/gift-cards/${C1}/block`,{unblock:false,reason:'loophole'},MGR_TOK,'POST');
  R('G11','block used card rejected',o.status===400&&o.data?.success===false&&o.data?.status==='used',`status=${o.status} body=${o.body.slice(0,160)}`);
  // G11b — loophole: unblock a USED card → rejected (no resurrection)
  o=await httpR(`/api/gift-cards/${C1}/block`,{unblock:true},MGR_TOK,'POST');
  R('G11b','unblock used card rejected',o.status===400&&o.data?.success===false,`status=${o.status} body=${o.body.slice(0,160)}`);

  // G12 — issue C2 (50) → block → blocked, balance preserved
  o=await httpR('/api/gift-cards',{code:C2,initial_balance:50,issued_to_name:'Gate C2',expires_at:null},MGR_TOK,'POST');
  const C2ok=o.data?.success===true;
  o=await httpR(`/api/gift-cards/${C2}/block`,{unblock:false,reason:'gate block'},MGR_TOK,'POST');
  const st2=S(`SELECT status, round(current_balance,2)::text FROM gift_cards WHERE code=${q(C2)}`);
  R('G12','block C2 → blocked, bal 50',C2ok&&o.status===200&&o.data?.status==='blocked'&&st2.startsWith('blocked')&&Number(st2.split('\t')[1])===50,`block=${o.status} db=${st2}`);

  // G13 — redeem blocked card → rejected
  o=await httpR('/api/gift-cards/redeem',{code:C2,amount:10},MGR_TOK,'POST');
  const bal2=S(`SELECT round(current_balance,2)::text FROM gift_cards WHERE code=${q(C2)}`);
  R('G13','redeem blocked rejected, bal intact',o.status===400&&Number(bal2)===50,`status=${o.status} bal=${bal2}`);

  // G14 — role gate: cashier cannot block → 403
  o=await http(`/api/gift-cards/${C2}/block`,{unblock:true},CASH_TOK,'POST');
  R('G14','cashier block → 403',o.status===403,`status=${o.status} body=${o.body.slice(0,120)}`);

  // G15 — unblock C2 (manager) → active again
  o=await httpR(`/api/gift-cards/${C2}/block`,{unblock:true,reason:'gate unblock'},MGR_TOK,'POST');
  const st2b=S(`SELECT status FROM gift_cards WHERE code=${q(C2)}`);
  R('G15','unblock C2 → active',o.status===200&&o.data?.status==='active'&&st2b==='active',`status=${o.status} db=${st2b}`);

  // G16 — expired flow: C3 issued with past expiry; redeem rejected 'expired';
  //        block OK (still active status); unblock → 'expired'
  const past=new Date(Date.now()-86400000).toISOString();
  o=await httpR('/api/gift-cards',{code:C3,initial_balance:25,expires_at:past},MGR_TOK,'POST');
  const c3issued=o.data?.success===true;
  o=await httpR('/api/gift-cards/redeem',{code:C3,amount:5},MGR_TOK,'POST');
  R('G16','expired card redeem rejected',c3issued&&o.status===400&&/expired/i.test(o.data?.error||''),`status=${o.status} body=${o.body.slice(0,160)}`);
  o=await httpR(`/api/gift-cards/${C3}/block`,{unblock:false,reason:'x'},MGR_TOK,'POST');
  const c3blocked=o.status===200&&o.data?.status==='blocked';
  o=await httpR(`/api/gift-cards/${C3}/block`,{unblock:true},MGR_TOK,'POST');
  const st3=S(`SELECT status FROM gift_cards WHERE code=${q(C3)}`);
  R('G16b','unblock past-expiry → expired',c3blocked&&o.data?.status==='expired'&&st3==='expired',`status=${o.status} db=${st3}`);

  // G17 — ledger 404 + invalid code 400 + block unknown 400
  o=await httpR('/api/gift-cards/GC_NOSUCH1/ledger',undefined,MGR_TOK);
  const ok404=o.status===404;
  o=await httpR('/api/gift-cards/!!/ledger',undefined,MGR_TOK);
  const ok400=o.status===400;
  o=await http(`/api/gift-cards/GC_NOSUCH1/block`,{unblock:false},MGR_TOK,'POST');
  const ok400b=o.status===400&&/not found/i.test(o.data?.error||'');
  R('G17','ledger 404 / bad code 400 / block unknown 400',ok404&&ok400&&ok400b,`404=${ok404} 400=${ok400} 400b=${ok400b}`);

  // G18 — DB invariant: for every GC_ card, current_balance == last ledger balance_after
  const inv=S(`SELECT count(*) FROM (SELECT c.id FROM gift_cards c WHERE c.code LIKE 'GC_GATE_%' AND c.current_balance <> (SELECT l.balance_after FROM gift_card_ledger l WHERE l.gift_card_id=c.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1)) x`);
  R('G18','invariant: balance == last ledger entry',inv==='0',`mismatches=${inv}`);

  // G19 — audit trail present (issue/redeem/block/unblock since T0)
  const auditAfter=S(`SELECT count(*) FROM audit_logs_canonical WHERE entity_type='gift_card' AND created_at > ${q(T0)}`);
  const auditActs=S(`SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit_logs_canonical WHERE entity_type='gift_card' AND created_at > ${q(T0)}`);
  const auditOk=Number(auditAfter)>=8&&/gift_card_block,gift_card_issue,gift_card_redeem,gift_card_unblock/.test(auditActs||'');
  R('G19','audit trail (>= 8 rows since T0, 4 action types)',auditOk,`new=${auditAfter} actions=${auditActs}`);

  // G20 — privilege surface: ledger table no anon/auth SELECT; block/summary
  // proacl has NO public (=X) grant (matches the vertical's frozen siblings)
  const p=S(`SELECT has_table_privilege('anon','gift_card_ledger','SELECT')||'|'||has_table_privilege('authenticated','gift_card_ledger','SELECT')||'|'||has_table_privilege('service_role','gift_card_ledger','SELECT')`);
  const aclB=S(`SELECT proacl::text FROM pg_proc WHERE proname='gift_card_block' AND pronamespace='public'::regnamespace`);
  const aclS=S(`SELECT proacl::text FROM pg_proc WHERE proname='gift_card_summary' AND pronamespace='public'::regnamespace`);
  // PUBLIC grant renders as a LEADING '{=X/' entry (role name empty);
  // 'postgres=X' etc. is a named-role grant and must not match.
  R('G20','privileges: anon/auth no ledger select, no PUBLIC exec',p==='false|false|true'&&!aclB.startsWith('{=X')&&!aclS.startsWith('{=X'),`anon|auth|svc=${p} block_acl=${aclB} summary_acl=${aclS}`);

  // ── teardown (F-contract: staff are NEUTRALIZED, never DELETEd —
  //     trg_staff_prevent_delete) ────────────────────────────────────────────
  S(`DELETE FROM sessions WHERE token IN (${q(MGR_TOK)},${q(CASH_TOK)})`);
  S(`DELETE FROM gift_cards WHERE code LIKE 'GC_GATE_%'`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE id IN (${q(MGR)},${q(CASH)})`);
  const residue=S(`SELECT (SELECT count(*) FROM gift_cards WHERE code LIKE 'GC_GATE_%')||'/'||(SELECT count(*) FROM gift_card_ledger WHERE gift_card_id IN (SELECT id FROM gift_cards WHERE code LIKE 'GC_GATE_%'))||'/'||(SELECT count(*) FROM staff WHERE id IN (${q(MGR)},${q(CASH)}) AND (is_active OR status<>'INACTIVE'))||'/'||(SELECT count(*) FROM sessions WHERE token IN (${q(MGR_TOK)},${q(CASH_TOK)}))`);
  R('TZ','teardown: zero residue (cards/ledger/active-staff/sessions)',residue==='0/0/0/0',`cards/ledger/activeStaff/sessions = ${residue}`);

  console.log(`\nGC GATE: ${PASS} pass / ${FAIL} fail`);
  process.exit(FAIL>0?1:0);
}catch(e){
  console.error('GATE CRASH:',e.message);
  console.log(`GC GATE: ${PASS} pass / ${FAIL} fail + CRASH`);
  process.exit(2);
}
})();
