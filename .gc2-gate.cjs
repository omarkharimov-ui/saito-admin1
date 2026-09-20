// GC 1.5 + CP-1 GATE — gift card load/refund + customer profile fields.
// Route-level E2E (real HTTP via :3000) + DB invariant proofs.
// Run: node .gc2-gate.cjs   (dev :3000, solo)
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001';
const MROLE='bb579b8a-022d-4f89-99c7-56eebcec3032', CASH_ROLE='945137c3-fc59-457e-abaa-c16ff8e9cee3';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,200)+'\n'+(r.stderr||'').slice(0,900));return r.stdout.trim().split('\n')[0]||'';};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='gc2gate_csrf';
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
  const A='GC_G2_'+crypto.randomBytes(3).toString('hex').toUpperCase();   // active card 100
  const B='GC_G2_'+crypto.randomBytes(3).toString('hex').toUpperCase()+'B'; // → used (fully redeemed)
  const C='GC_G2_'+crypto.randomBytes(3).toString('hex').toUpperCase()+'C'; // → blocked
  const D='GC_G2_'+crypto.randomBytes(3).toString('hex').toUpperCase()+'D'; // → expired (past expiry)
  const CUST=S(`SELECT id FROM customers LIMIT 1`);
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(MGR)},'GC2_MGR','GC2_MGR',${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)}),(${q(CASH)},'GC2_CASH','GC2_CASH',${q(CASH_ROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) SELECT s.id, l.id, true, true, ${q(ORG)} FROM staff s, (SELECT id FROM locations LIMIT 1) l WHERE s.id IN (${q(MGR)},${q(CASH)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id) VALUES (${q(MGR_TOK)},${q(MGR)},'manager',now()+interval '2h','ACTIVE',${q(ORG)}),(${q(CASH_TOK)},${q(CASH)},'cashier',now()+interval '2h','ACTIVE',${q(ORG)})`);
  // fixtures: A active 100 · B used (100 fully redeemed) · C blocked 50 · D expired 25
  S(`SELECT gift_card_issue(${q(A)},100,NULL,'G2 A',NULL,NULL)`);
  S(`SELECT gift_card_issue(${q(B)},100,NULL,'G2 B',NULL,NULL)`);
  S(`SELECT gift_card_redeem(${q(B)},100,NULL,NULL)`);
  S(`SELECT gift_card_issue(${q(C)},50,NULL,'G2 C',NULL,NULL)`);
  S(`SELECT gift_card_block(${q(C)},false,'fixture',NULL)`);
  S(`SELECT gift_card_issue(${q(D)},25,NULL,'G2 D',NULL, now() - interval '2 days')`);
  console.log(`G2 FIXTURES: A=${A} B=${B} C=${C} D=${D} cust=${CUST}`);

  // ── LOAD ──────────────────────────────────────────────────────────────────
  let o=await httpR(`/api/gift-cards/${A}/load`,{amount:25,reason:'gate load'},MGR_TOK,'POST');
  const balA=S(`SELECT round(current_balance,2)::text, status FROM gift_cards WHERE code=${q(A)}`);
  R('L1','load active → 125 + ledger',o.status===200&&o.data?.success===true&&Number(balA.split('\t')[0])===125&&balA.split('\t')[1]==='active'&&S(`SELECT type FROM gift_card_ledger l JOIN gift_cards c ON c.id=l.gift_card_id WHERE c.code=${q(A)} ORDER BY l.created_at DESC LIMIT 1`)==='load',`http=${o.status} db=${balA}`);

  o=await httpR(`/api/gift-cards/${B}/load`,{amount:10},MGR_TOK,'POST');
  R('L2','load used → rejected',o.status===400&&o.data?.success===false&&o.data?.status==='used',`http=${o.status} body=${o.body.slice(0,140)}`);

  o=await httpR(`/api/gift-cards/${C}/load`,{amount:10},MGR_TOK,'POST');
  R('L3','load blocked → rejected',o.status===400&&o.data?.status==='blocked',`http=${o.status} body=${o.body.slice(0,140)}`);

  o=await httpR(`/api/gift-cards/${D}/load`,{amount:10},MGR_TOK,'POST');
  R('L4','load expired → rejected (lazy-expiry guard)',o.status===400&&/expired/i.test(o.body),`http=${o.status} body=${o.body.slice(0,140)}`);

  // ── REFUND ────────────────────────────────────────────────────────────────
  o=await httpR(`/api/gift-cards/${A}/refund`,{amount:15,reason:'gate refund'},MGR_TOK,'POST');
  const balA2=S(`SELECT round(current_balance,2)::text, status FROM gift_cards WHERE code=${q(A)}`);
  R('R1','refund active → 140 + ledger',o.status===200&&Number(balA2.split('\t')[0])===140&&S(`SELECT type FROM gift_card_ledger l JOIN gift_cards c ON c.id=l.gift_card_id WHERE c.code=${q(A)} ORDER BY l.created_at DESC LIMIT 1`)==='refund',`http=${o.status} db=${balA2}`);

  o=await httpR(`/api/gift-cards/${B}/refund`,{amount:40,reason:'gate refund used'},MGR_TOK,'POST');
  const stB=S(`SELECT status, round(current_balance,2)::text FROM gift_cards WHERE code=${q(B)}`);
  // pooler quirk: round(x,2)::text may render '40' or '40.00' → compare via Number()
  R('R2','refund used → RESURRECT active + 40',o.status===200&&o.data?.previous_status==='used'&&o.data?.status==='active'&&stB.split('\t')[0]==='active'&&Number(stB.split('\t')[1])===40,`http=${o.status} db=${stB}`);

  o=await httpR(`/api/gift-cards/${C}/refund`,{amount:5},MGR_TOK,'POST');
  R('R3','refund blocked → rejected',o.status===400&&o.data?.status==='blocked',`http=${o.status} body=${o.body.slice(0,140)}`);

  o=await httpR(`/api/gift-cards/${D}/refund`,{amount:5},MGR_TOK,'POST');
  R('R4','refund expired → rejected (lazy-expiry guard)',o.status===400&&/expired/i.test(o.body),`http=${o.status} body=${o.body.slice(0,140)}`);

  // resurrected B is now redeemable again (balance actually usable)
  o=await httpR('/api/gift-cards/redeem',{code:B,amount:10},MGR_TOK,'POST');
  R('R5','resurrected card redeems (10 → 30)',o.status===200&&Number(o.data?.remaining_balance)===30,`http=${o.status} body=${o.body.slice(0,140)}`);

  // ── roles / auth ─────────────────────────────────────────────────────────
  o=await http(`/api/gift-cards/${A}/load`,{amount:1},CASH_TOK,'POST');
  R('X1','cashier load → 403',o.status===403,`http=${o.status}`);
  o=await http(`/api/gift-cards/${A}/refund`,{amount:1},CASH_TOK,'POST');
  R('X2','cashier refund → 403',o.status===403,`http=${o.status}`);
  o=await http(`/api/gift-cards/${A}/load`,{amount:1},null,'POST');
  R('X3','unauth load → 401',o.status===401,`http=${o.status}`);
  o=await httpR(`/api/gift-cards/${A}/load`,{amount:-5},MGR_TOK,'POST');
  R('X4','negative amount → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,120)}`);

  // ── CP-1: customer profile ───────────────────────────────────────────────
  o=await httpR(`/api/customers/${CUST}/profile`,{birthday:'1990-05-15',email:'gate@test.com',notes:'gate note'},MGR_TOK,'POST');
  const cp=S(`SELECT birthday::text, coalesce(email,'null'), coalesce(notes,'null') FROM customers WHERE id=${q(CUST)}`);
  R('P1','profile save → persisted',o.status===200&&cp==='1990-05-15\tgate@test.com\tgate note',`http=${o.status} db=${cp}`);

  o=await httpR(`/api/customers/${CUST}/profile`,{email:'not-an-email'},MGR_TOK,'POST');
  R('P2','bad email → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,120)}`);
  o=await httpR(`/api/customers/${CUST}/profile`,{birthday:'15.05.1990'},MGR_TOK,'POST');
  R('P3','bad date → 400',o.status===400,`http=${o.status} body=${o.body.slice(0,120)}`);
  o=await http(`/api/customers/${CUST}/profile`,{notes:'x'},CASH_TOK,'POST');
  R('P4','cashier profile → 403',o.status===403,`http=${o.status}`);
  o=await http(`/api/customers/${CUST}/profile`,{notes:'x'},null,'POST');
  R('P5','unauth profile → 401',o.status===401,`http=${o.status}`);

  // timeline RPC exposes the new fields
  const tlf=S(`SELECT (get_customer_timeline(${q(CUST)},1))::json->'customer'`);
  // PG json text output renders ': ' (space after colon) — allow optional whitespace
  R('P6','timeline RPC has birthday/email/notes',/"birthday":\s*"1990-05-15"/.test(tlf)&&/"email":\s*"gate@test.com"/.test(tlf),`customer=${tlf.slice(0,200)}`);

  // ── invariants ────────────────────────────────────────────────────────────
  const inv=S(`SELECT count(*) FROM (SELECT c.id FROM gift_cards c WHERE c.code LIKE 'GC_G2_%' AND c.current_balance <> (SELECT l.balance_after FROM gift_card_ledger l WHERE l.gift_card_id=c.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1)) x`);
  R('INV','balance == last ledger entry (all G2 cards)',inv==='0',`mismatches=${inv}`);
  const audit=S(`SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit_logs_canonical WHERE entity_type='gift_card' AND created_at > ${q(T0)}`);
  R('AUD','audit: load + refund recorded',/gift_card_load/.test(audit||'')&&/gift_card_refund/.test(audit||''),`actions=${audit}`);

  // ── teardown (F-contract: staff INACTIVE, never DELETE) ──────────────────
  S(`DELETE FROM sessions WHERE token IN (${q(MGR_TOK)},${q(CASH_TOK)})`);
  S(`DELETE FROM gift_cards WHERE code LIKE 'GC_G2_%'`);
  S(`UPDATE staff SET is_active=false, status='INACTIVE' WHERE id IN (${q(MGR)},${q(CASH)})`);
  S(`UPDATE customers SET birthday=NULL, email=NULL, notes=NULL WHERE id=${q(CUST)}`);
  const residue=S(`SELECT (SELECT count(*) FROM gift_cards WHERE code LIKE 'GC_G2_%')||'/'||(SELECT count(*) FROM sessions WHERE token IN (${q(MGR_TOK)},${q(CASH_TOK)}))||'/'||(SELECT count(*) FROM staff WHERE id IN (${q(MGR)},${q(CASH)}) AND (is_active OR status<>'INACTIVE'))||'/'||(SELECT count(*) FROM customers WHERE id=${q(CUST)} AND (birthday IS NOT NULL OR email IS NOT NULL OR notes IS NOT NULL))`);
  R('TZ','teardown: zero residue',residue==='0/0/0/0',`residue=${residue}`);

  console.log(`\nGC2 GATE: ${PASS} pass / ${FAIL} fail`);
  process.exit(FAIL>0?1:0);
}catch(e){
  console.error('GATE CRASH:',e.message);
  console.log(`GC2 GATE: ${PASS} pass / ${FAIL} fail + CRASH`);
  process.exit(2);
}
})();
