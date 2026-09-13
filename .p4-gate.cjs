// P-4 IDEMPOTENCY GATE (ratified D-1..D-8, 2026-09-13) — idempotent, zero-residue.
// Contract: P4_IDEMPOTENCY_CONTRACT_2026-09-13.md
// Acceptance: "For every retried client payment/refund request, the database
// produces at most one financial effect, and a reused idempotency key can never
// silently represent a different operation."
//
// Design (v2, after 40001→P0001 root-cause fix + pooler lessons):
//  - Batched fixtures: 15 staff + 15 sessions + 17 orders in 3 psql spawns
//    (pooler-spawn-storm avoidance).
//  - One DEDICATED token per test (<=3 pay calls < 5/60s limiter) → deterministic,
//    never rate-limited.
//  - 4s settle between successive HTTP ops (PostgREST/pooler headroom; a 500
//    "upstream request timeout" is treated as INFRA, never as a contract pass).
// Run: node .p4-gate.cjs   (dev server on :3000 required; run after pooler drain)
'use strict';
const crypto = require('crypto'); const { spawnSync } = require('child_process'); const fs = require('fs');
const APP = process.env.APP || 'http://localhost:3000';
const DB = process.env.DBHOST || 'aws-1-eu-central-1.pooler.supabase.com';
const DBU = process.env.DBUSER || 'postgres.jbxmlnsicbfkbsatnoej';
const DBPW = process.env.DBPASS || 'hivhU3-sathob-bupcar';
const REST = 'https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1';
const SVC = (process.env.SVC || '').trim() || (() => {
  try { return fs.readFileSync('artifacts/saito-admin/.env.local','utf8').split('\n').find(l=>l.startsWith('SUPABASE_SERVICE_ROLE_KEY'))?.split('=')[1]?.trim().replace(/["']/g,'') || ''; } catch { return ''; }
})();
const ORG='00000000-0000-0000-0000-000000000001';
const LOC_A='f1f830b3-cf15-47e3-a538-01abd8222c6d';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const S=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});if(r.status!==0)throw new Error('SQL: '+sql.slice(0,160)+'\n'+(r.stderr||'').slice(0,700));return r.stdout.trim().split('\n')[0]||'';};
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim().split('\n')[0]||'',err:(r.stderr||'').trim()};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CSRF='p4gate_csrf';
const SETTLE=4000;
async function rawHttp(path,body,token){const h={'Content-Type':'application/json'};if(token){h['Cookie']=`saito_token=${token}; saito_csrf=${CSRF}`;h['x-csrf-token']=CSRF;}const r=await fetch(APP+path,{method:'POST',headers:h,body:body!==undefined?JSON.stringify(body):undefined,redirect:'manual'});let data=null;try{data=await r.json();}catch{}return {status:r.status,data,body:data?JSON.stringify(data):''};}
// A 500 "upstream request timeout" = INFRA (PostgREST/pooler), not contract.
// Retry ONCE after a longer settle. A real 200/400/409 is returned as-is (never retried).
async function call(path,body,token){const r=await rawHttp(path,body,token);
  if(r.status===500 && /upstream request timeout/i.test(r.body)){await sleep(SETTLE*3);return rawHttp(path,body,token);}
  return r;}
async function rpc(fn,args){const r=await fetch(REST+'/rpc/'+fn,{method:'POST',headers:{'apikey':SVC,'Authorization':'Bearer '+SVC,'Content-Type':'application/json'},body:JSON.stringify(args||{})});let data=null;try{data=await r.json();}catch{}return {status:r.status,data,body:JSON.stringify(data)};}

let PASS=0,FAIL=0; const results=[]; const OIDS=[];
function P(id,name,ok,evidence){ok=!!ok;if(ok)PASS++;else FAIL++;results.push({id,name,pass:ok,evidence:String(evidence).slice(0,240)});console.log((ok?'PASS ':'FAIL ')+id+' '+name+(ok?'':' -> '+String(evidence).slice(0,200)));}

// ---------- BATCH FIXTURES ----------
const MROLE=S(`SELECT id::text FROM roles WHERE name='manager'`);
const NSTAFF=15, NORD=17;
const UIDS=[],TOKS=[],OIDL=[];
for(let i=0;i<NSTAFF;i++){UIDS.push(crypto.randomUUID());TOKS.push(crypto.randomUUID());}
for(let i=0;i<NORD;i++){OIDL.push(crypto.randomUUID());}
const staffRows=UIDS.map(u=>`(${q(u)},${q('P4_MGR')},${q('P4_MGR')},${q(MROLE)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`).join(',');
const sessRows=TOKS.map((t,i)=>`(${q(t)},${q(UIDS[i])},${q('manager')},now()+interval '3h','ACTIVE',${q(ORG)},${q(LOC_A)})`).join(',');
const orderRows=OIDL.map(id=>`(${q(id)},NULL,'confirmed',1,100,${q(LOC_A)},${q(ORG)},'pending',false,now(),now(),1)`).join(',');
S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES ${staffRows}`);
S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES ${sessRows}`);
S(`INSERT INTO orders(id,table_number,status,guest_count,total_amount,location_id,organization_id,kitchen_status,is_draft,created_at,updated_at,version) VALUES ${orderRows}`);
OIDL.forEach(id=>OIDS.push(id));
const ORDS=OIDL;
const T=i=>TOKS[i];
// P-3 proven pattern: order carries total_amount; NO order_items row.
const pay=(tok,oid,amt,key,method='card')=>call('/api/orders/pay',{order_id:oid,payment_method:method,paid_amount:amt,cash_amount:method==='cash'?amt:0,card_amount:method!=='cash'?amt:0,tip_amount:0,discount_amount:0,idempotency_key:key},tok);
const refund=(tok,oid,amt,key,method='cash')=>call('/api/orders/refund',{order_id:oid,amount:amt,method,idempotency_key:key},tok);
const rows=oid=>Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oid)}`).out;
const refRows=oid=>Sx(`SELECT count(*)::text FROM order_payments WHERE order_id=${q(oid)} AND is_refund=true`).out;
const snap=oid=>Sx(`SELECT paid_amount::text||'|'||refund_amount::text||'|'||version::text||'|'||status FROM orders WHERE id=${q(oid)}`).out;
const oidKey=n=>`p4:${n}:${crypto.randomUUID()}`;
const cleanup=()=>{const list=OIDS.map(q).join(',');
  S(`BEGIN; SELECT set_config('app.payment_ledger_reopen','on',false);
      DELETE FROM payment_idempotency_keys WHERE order_id IN (${list});
      DELETE FROM order_payments WHERE order_id IN (${list});
      DELETE FROM outbox_events WHERE aggregate_id IN (${list});
      DELETE FROM audit_logs WHERE order_id IN (${list});
      DELETE FROM operation_logs WHERE order_id IN (${list});
      DELETE FROM orders WHERE id IN (${list});
      SELECT set_config('app.payment_ledger_reopen','off',false); COMMIT;`);
  Sx(`DELETE FROM payment_idempotency_keys WHERE key LIKE 'p4:%'`);
  S(`UPDATE staff SET is_active=false,status='INACTIVE' WHERE name LIKE 'P4\\_%'`);
  Sx(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P4\\_%')`);
};
(async()=>{
try{
  // Let PostgREST/Next session validation settle after the batched fixture insert
  // so each fresh token's FIRST pay call isn't a rushed 403 (observed transient in v4).
  await sleep(6000);
  // ===== 1: keyed exact duplicate (same key + same payload) =====
  { const O=ORDS[0],K=oidKey('dup');
    const a=await pay(T(0),O,100,K); await sleep(SETTLE);
    const b=await pay(T(0),O,100,K); await sleep(SETTLE);
    P('P4-01','keyed exact duplicate -> one effect; replay has idempotent+current layers',
      a.status===200 && b.status===200 && b.data?.idempotent===true && b.data?.duplicate===true && b.data?.replay?.current?.status==='paid' && rows(O)==='1',
      `a=${a.status} b=${b.status} rows=${rows(O)} replay=${b.data?.replay?JSON.stringify(b.data.replay).slice(0,80):'ABSENT'}`);}
  // ===== 2: keyless -> 400, zero mutation =====
  { const O=ORDS[1];
    const r=await call('/api/orders/pay',{order_id:O,payment_method:'card',paid_amount:100,cash_amount:0,card_amount:100,tip_amount:0,discount_amount:0},T(1)); await sleep(SETTLE);
    P('P4-02','keyless pay -> 400 IDEMPOTENCY_KEY_REQUIRED + zero mutation',
      r.status===400 && /IDEMPOTENCY_KEY_REQUIRED/.test(r.body) && rows(O)==='0', `status=${r.status} rows=${rows(O)} ${r.body.slice(0,70)}`);}
  // ===== 3: double-click (concurrent same key) =====
  { const O=ORDS[2],K=oidKey('dbl');
    const [a,b]=await Promise.all([pay(T(2),O,100,K),pay(T(2),O,100,K)]); await sleep(SETTLE);
    const replays=[a,b].filter(r=>r.data?.idempotent===true).length;
    P('P4-03','double-click (concurrent same key) -> exactly one effect, one replay',
      a.status===200 && b.status===200 && rows(O)==='1' && replays===1, `rows=${rows(O)} replays=${replays} a=${a.status} b=${b.status}`);}
  // ===== 4: network retry (lost response, same key resend) =====
  { const O=ORDS[3],K=oidKey('retry');
    const a=await pay(T(3),O,100,K); await sleep(SETTLE);
    const b=await pay(T(3),O,100,K); await sleep(SETTLE);
    P('P4-04','network retry (same key, sim lost response) -> replay, still one effect',
      a.status===200 && b.status===200 && b.data?.idempotent===true && rows(O)==='1', `a=${a.status} b=${b.status} rows=${rows(O)}`);}
  // ===== 6: same key + different amount -> 409, zero mutation =====
  { const O=ORDS[4],K=oidKey('amt');
    const a=await pay(T(4),O,23,K); await sleep(SETTLE);
    const before=snap(O);
    const b=await pay(T(4),O,40,K); await sleep(SETTLE);
    const after=snap(O);
    P('P4-06','same key + different amount -> 409 IDEMPOTENCY_CONFLICT + zero mutation',
      a.status===200 && b.status===409 && /IDEMPOTENCY_CONFLICT/.test(b.body) && before===after && rows(O)==='1',
      `a=${a.status} b=${b.status} before=${before} after=${after} rows=${rows(O)} ${b.body.slice(0,60)}`);}
  // ===== 7: same key + different order -> 409, zero mutation on B =====
  { const OA=ORDS[5],OB=ORDS[6],K=oidKey('ord');
    const a=await pay(T(5),OA,50,K); await sleep(SETTLE);
    const b=await pay(T(5),OB,50,K); await sleep(SETTLE);
    P('P4-07','same key + different order -> 409 + zero mutation on order B',
      a.status===200 && b.status===409 && /IDEMPOTENCY_CONFLICT/.test(b.body) && rows(OB)==='0',
      `a=${a.status} b=${b.status} rowsB=${rows(OB)} ${b.body.slice(0,60)}`);}
  // ===== 8: different keys -> independent (both 50s = full 100, 2 rows) =====
  { const O=ORDS[7];
    const a=await pay(T(6),O,50,oidKey('kA')); await sleep(SETTLE);
    const b=await pay(T(6),O,50,oidKey('kB')); await sleep(SETTLE);
    P('P4-08','different keys -> independent (both charged, full 100, 2 rows)',
      a.status===200 && b.status===200 && rows(O)==='2', `a=${a.status} b=${b.status} rows=${rows(O)}`);}
  // ===== 9/10: refund double-click + same-key replay after state change =====
  { const O=ORDS[8],KR=oidKey('refdb');
    const p=await pay(T(7),O,100,oidKey('pay9')); await sleep(SETTLE);
    const r1=await refund(T(7),O,40,KR); await sleep(SETTLE);
    const r2=await refund(T(7),O,40,KR); await sleep(SETTLE);
    P('P4-09','refund double-click (same key) -> one refund row, second = replay',
      p.status===200 && r1.status===200 && r2.status===200 && r2.data?.idempotent===true && refRows(O)==='1',
      `p=${p.status} r1=${r1.status} r2=${r2.status} refRows=${refRows(O)} ${r2.body.slice(0,50)}`);
    // D-5 freshness: change the order's refund state, then replay KR. The replay's
    // `current` layer must reflect the NEW live state (refund_amount 40 -> 60), not
    // the frozen original. NOTE: this order model decrements paid_amount on refund,
    // so after refunding 40 the live cap = 20 remaining -> the 2nd refund must be
    // exactly 20 (a 30 would correctly 400 "exceeds remaining (20)").
    const r3a=await refund(T(7),O,20,oidKey('ref9b')); await sleep(SETTLE);   // 2nd distinct refund (20)
    const r4=await refund(T(7),O,40,KR); await sleep(SETTLE);                 // replay KR
    // REFUND route returns RAW RPC data: top-level data.current / data.original (no .replay wrapper).
    // D-5 proof: `current` = live re-read (refund_amount now 60, status partially_refunded);
    // `original` = the stored first-success snapshot (remaining was 40 then). current ≠ original.
    P('P4-10','refund same-key replay AFTER state change -> current=LIVE (refund_amount=60), original=frozen snapshot (D-5 freshness)',
      r3a.status===200 && r4.status===200 && r4.data?.idempotent===true
        && Number(r4.data?.current?.refund_amount)===60
        && r4.data?.current?.status==='partially_refunded'
        && Number(r4.data?.original?.remaining)===40
        && JSON.stringify(r4.data?.current)!==JSON.stringify(r4.data?.original),
      `r3a=${r3a.status} r4=${r4.status} current.refund_amount=${r4.data?.current?.refund_amount} current.status=${r4.data?.current?.status} original.remaining=${r4.data?.original?.remaining} orig.action=${r4.data?.original?.action}`);}
  // ===== 11: concurrent identical (same key) =====
  { const O=ORDS[9],K=oidKey('conci');
    const [a,b]=await Promise.all([pay(T(8),O,100,K),pay(T(8),O,100,K)]); await sleep(SETTLE);
    const replays=[a,b].filter(r=>r.data?.idempotent===true).length;
    P('P4-11','concurrent IDENTICAL (same key) -> one effect, one replay',
      a.status===200 && b.status===200 && rows(O)==='1' && replays===1, `rows=${rows(O)} replays=${replays} a=${a.status} b=${b.status}`);}
  // ===== 12: concurrent different keys -> no double-charge =====
  { const O=ORDS[10];
    const [a,b]=await Promise.all([pay(T(9),O,100,oidKey('cA')),pay(T(9),O,100,oidKey('cB'))]); await sleep(SETTLE);
    const paid=parseFloat(Sx(`SELECT coalesce(sum(amount),0)::text FROM order_payments WHERE order_id=${q(O)} AND status='captured'`).out);
    P('P4-12','concurrent DIFFERENT keys (full 100 x2) -> no double-charge (paid=100)',
      (a.status===200||b.status===200) && paid<=100.001, `paid=${paid} a=${a.status} b=${b.status}`);}
  // ===== 13: failed attempt does NOT consume key; corrected retry succeeds (D-7) =====
  { const O=ORDS[11],K=oidKey('failretry');
    const a=await pay(T(10),O,150,K); await sleep(SETTLE);          // overpay -> reject, no key row
    const b=await pay(T(10),O,100,K); await sleep(SETTLE);          // corrected, SAME key -> success
    const keyRow=Sx(`SELECT count(*)::text FROM payment_idempotency_keys WHERE key=${q(K)}`).out;
    P('P4-13','failed (overpay) does NOT consume key; corrected retry same key succeeds (D-7)',
      a.status===500 && /PAYMENT_EXCEEDS_REMAINING/.test(a.body) && b.status===200 && rows(O)==='1' && keyRow==='1',
      `a=${a.status} b=${b.status} rows=${rows(O)} keyrow=${keyRow} ${a.body.slice(0,40)}`);}
  // ===== 15: replay + rejected mismatch -> ledger/version UNCHANGED =====
  { const O=ORDS[12],K=oidKey('zeromut');
    const p=await pay(T(11),O,100,K); await sleep(SETTLE);
    const before=snap(O);
    const rep=await pay(T(11),O,100,K); await sleep(SETTLE);         // same key+payload -> replay
    const rej=await pay(T(11),O,99,oidKey('other')); await sleep(SETTLE); // diff key, order paid -> 409 ORDER_ALREADY_PAID
    const after=snap(O);
    P('P4-15','replay + rejected mismatch -> order ledger/version UNCHANGED (zero mutation)',
      before===after && rep.status===200 && rej.status===409, `before=${before} after=${after} replay=${rep.status} reject=${rej.status}`);}
  // ===== 16: exactly-once ledger effect across all duplicate tests =====
  { const once=['P4-01','P4-03','P4-04','P4-06','P4-09','P4-11'].every(id=>results.find(r=>r.id===id)?.pass);
    P('P4-16','exactly-once ledger effect across all duplicate tests',once,'see P4-01/03/04/06/09/11');}
  // ===== 17: PK (namespace,key) uniqueness + namespace isolation =====
  { const O=ORDS[13],K=oidKey('uniq');
    const p=await pay(T(12),O,100,K); await sleep(SETTLE);
    // no 'id' column (PK is (namespace,key)) — insert status code is the assertion.
    const dup=Sx(`INSERT INTO payment_idempotency_keys(namespace,key,order_id,amount,status,result,expires_at) VALUES('payment',${q(K)},${q(O)},100,'completed','{}'::jsonb,now()+interval '30 days')`);
    P('P4-17','PK (namespace,key): duplicate insert REJECTED (PK violation)',dup.status!==0,'status='+dup.status+' err='+(dup.err||'').slice(0,80));
    const iso=Sx(`INSERT INTO payment_idempotency_keys(namespace,key,order_id,amount,status,result,expires_at) VALUES('refund',${q(K)},${q(O)},100,'completed','{}'::jsonb,now()+interval '30 days')`);
    P('P4-17b','namespace isolation: same key in refund namespace = independent (allowed)',iso.status===0,'status='+iso.status+' err='+(iso.err||'').slice(0,80));}
  // ===== 18: TTL / pruner (expired deleted, live kept) =====
  { const O=ORDS[14]; const KEXP=oidKey('tlle'),KLIVE=oidKey('tlll');
    Sx(`INSERT INTO payment_idempotency_keys(namespace,key,order_id,amount,status,result,expires_at) VALUES('payment',${q(KEXP)},${q(O)},100,'completed','{}'::jsonb,now()-interval '1 hour'),('payment',${q(KLIVE)},${q(O)},100,'completed','{}'::jsonb,now()+interval '29 days')`);
    const pr=await rpc('prune_expired_idempotency_keys',{}); await sleep(SETTLE);
    const gone=Sx(`SELECT count(*)::text FROM payment_idempotency_keys WHERE key=${q(KEXP)}`).out;
    const kept=Sx(`SELECT count(*)::text FROM payment_idempotency_keys WHERE key=${q(KLIVE)}`).out;
    P('P4-18','TTL pruner: expired key deleted, live key kept', gone==='0' && kept==='1',
      `pruned=${pr.data} expiredGone=${gone} liveKept=${kept}`);}
  // ===== 19: redundant index absent + scoped PK present =====
  { const dupIdx=Sx(`SELECT count(*)::text FROM pg_constraint WHERE conname='payment_idempotency_keys_key_unique'`).out;
    const pkDef=Sx(`SELECT indexdef FROM pg_indexes WHERE tablename='payment_idempotency_keys' AND indexname LIKE '%ns_key_pkey%'`).out;
    P('P4-19','redundant key_unique GONE + scoped PK (namespace,key) present',
      dupIdx==='0' && /btree \(namespace, key\)/.test(pkDef), `dupIdx=${dupIdx} pk=${pkDef}`);}
  // ===== cleanup / zero residue =====
  cleanup();
  const rs=Sx(`SELECT count(*)::text FROM staff WHERE name LIKE 'P4\\_%' AND is_active=true`).out;
  const ro=Sx(`SELECT count(*)::text FROM orders WHERE id IN (${OIDS.map(q).join(',')})`).out;
  const rk=Sx(`SELECT count(*)::text FROM payment_idempotency_keys WHERE key LIKE 'p4:%'`).out;
  P('P4-90','zero residue: P4_ staff inactive, probe orders + p4: keys gone', rs==='0'&&ro==='0'&&rk==='0',`staff=${rs} orders=${ro} keys=${rk}`);

  console.log(`\n==== P-4 GATE: ${PASS}/${PASS+FAIL} PASS${FAIL?' — FAILED':' (ALL GREEN)'} ====`);
  fs.writeFileSync('.p4-gate-report.json',JSON.stringify({at:new Date().toISOString(),total:PASS+FAIL,passed:PASS,failed:FAIL,results},null,1));
  process.exit(FAIL?1:0);
}catch(e){ console.error('P4 PROBE ERROR:',e.message); try{cleanup();}catch{} console.log(`==== P-4 GATE: ${PASS}/${PASS+FAIL} (ABORT: ${String(e.message).slice(0,80)}) ====`); process.exit(2); }
})();
