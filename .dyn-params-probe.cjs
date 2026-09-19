// Next 16 async-params fix probe — stock dynamic routes (W-A3 FOLLOW-UP).
// Empirical model (proven at W-A3): with the old sync pattern, params.id is
// undefined at runtime -> supabase-js eq(col, undefined) throws client-side.
// After the fix, the id filter REACHES PostgREST:
//   1. GET /api/stock/counts/{FAKE}/items -> 200 []            (array endpoint)
//   2. GET /api/stock/returns/{FAKE}      -> 500 "no/multiple rows" (PGRST116, .single() on empty filter result)
//   3. GET /api/stock/counts/{FAKE}       -> 500 "no/multiple rows"
// Distinguishing signature: a BROKEN route returns the supabase-js client
// error (e.g. "Invalid value" / "value is required") WITHOUT hitting the DB.
// Self-cleaning staff+session fixture. Read-only against data (empty tables).
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOC_A='f1f830b3-cf15-47e3-a538-01abd8222c6d';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,160)+'\n'+(r.stderr||'').slice(0,600));return r.stdout.trim().split('\n')[0]||'';};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='dynprobe_csrf';
function http(path,token){return new Promise((res)=>{const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}const r=require('http').request({hostname:'localhost',port:3000,path,method:'GET',headers:h,timeout:25000},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('timeout',()=>{try{r.destroy();}catch{}});r.on('error',e=>res({status:0,body:'ERR '+e.message}));r.end();});}

(async()=>{
  const MROLE=S(`SELECT id::text FROM roles WHERE name='manager'`);
  const STAFF_ID=crypto.randomUUID(), TOK=crypto.randomUUID();
  S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES (${q(STAFF_ID)},'W3_PROBE_MGR','W3_PROBE_MGR',${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);
  S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES (${q(STAFF_ID)},${q(LOC_A)},true,true,${q(ORG)})`);
  S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES (${q(TOK)},${q(STAFF_ID)},'manager',now()+interval '1h','ACTIVE',${q(ORG)},${q(LOC_A)})`);
  await sleep(4000);
  const FAKE='99999999-9999-9999-9999-999999999999';
  let fail=0;
  const R=(name,ok,ev)=>{console.log((ok?'  PASS        ':'!!! FAIL      ')+name+(ok?'':'\n   -> '+ev.slice(0,300)));if(!ok)fail++;};
  try{
    const p1=await http(`/api/stock/counts/${FAKE}/items`,TOK);
    let a1=null; try{a1=JSON.parse(p1.body);}catch{}
    R('counts/{id}/items -> 200 [] (id filter reached DB)', p1.status===200&&Array.isArray(a1)&&a1.length===0, `status=${p1.status} body=${p1.body.slice(0,160)}`);
    const p2=await http(`/api/stock/returns/${FAKE}`,TOK);
    // PGRST116 on modern PostgREST reads "Cannot coerce the result to a single
    // JSON object" — a DB-side no-rows error = the id filter REACHED the DB
    // (broken params would fail client-side or with PGRST204 bad-uuid).
    R('returns/{id} -> 500 PGRST116 (filter reached PostgREST)', p2.status===500&&/Cannot coerce the result to a single JSON object|PGRST116|multiple \(or no\) rows/i.test(p2.body), `status=${p2.status} body=${p2.body.slice(0,160)}`);
    const p3=await http(`/api/stock/counts/${FAKE}`,TOK);
    R('counts/{id} -> 500 PGRST116 (filter reached PostgREST)', p3.status===500&&/Cannot coerce the result to a single JSON object|PGRST116|multiple \(or no\) rows/i.test(p3.body), `status=${p3.status} body=${p3.body.slice(0,160)}`);
    const p4=await http(`/api/stock/counts/${FAKE}/items`,null);
    R('no session -> 401 (auth chain intact)', p4.status===401, `status=${p4.status}`);
  }finally{
    const c=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-v','ON_ERROR_STOP=1','-c',
      `UPDATE staff SET is_active=false,status='INACTIVE',pin_hash='' WHERE id=${q(STAFF_ID)}; DELETE FROM sessions WHERE user_id=${q(STAFF_ID)}; DELETE FROM staff_locations WHERE staff_id=${q(STAFF_ID)};`],
      {encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});
    if(c.status!==0)throw new Error('fixture cleanup failed: '+(c.stderr||'').slice(0,400));
    const left=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-c',
      `SELECT (SELECT count(*)::text FROM staff WHERE id=${q(STAFF_ID)} AND (is_active OR status='ACTIVE' OR pin_hash<>''))||'/'||(SELECT count(*)::text FROM sessions WHERE user_id=${q(STAFF_ID)})||'/'||(SELECT count(*)::text FROM staff_locations WHERE staff_id=${q(STAFF_ID)})`],
      {encoding:'utf8',timeout:60000,env:{...process.env,PGPASSWORD:DBPW}});
    console.log('  fixture residue: '+(left.stdout||'').trim()+' (expect 0/0/0)');
  }
  console.log(fail===0?'\nDYN-PARAMS PROBE: ALL PASS':'\nDYN-PARAMS PROBE: FAILURES='+fail);
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('PROBE CRASH: '+e.message);process.exit(2);});
