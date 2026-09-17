// debug: reproduce gate residue() + inspect run-1 cleanup leftovers
'use strict';
const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim().split('\n')[0]||'',err:(r.stderr||'').trim()};};
const UIDS=['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333'];
const uidl=UIDS.map(q).join(',');
const res=Sx(`(SELECT 'drawer_sessions='||count(*) FROM cash_drawer_sessions WHERE opened_by IN (${uidl}) OR shift_id IN (SELECT id FROM shifts WHERE staff_id IN (${uidl}))) || '/' ||
    (SELECT 'drawer_log='||count(*) FROM cash_drawer_log WHERE created_by IN (${uidl}) OR session_id IN (SELECT id FROM cash_drawer_sessions WHERE opened_by IN (${uidl}))) || '/' ||
    (SELECT 'shifts='||count(*) FROM shifts WHERE staff_id IN (${uidl})) || '/' ||
    (SELECT 'breaks='||count(*) FROM shift_breaks WHERE staff_id IN (${uidl})) || '/' ||
    (SELECT 'tce='||count(*) FROM time_clock_entries WHERE staff_id IN (${uidl})) || '/' ||
    (SELECT 'orders='||count(*) FROM orders WHERE id='99999999-9999-9999-9999-999999999999') || '/' ||
    (SELECT 'idem='||count(*) FROM payment_idempotency_keys WHERE key LIKE 'p8:%') || '/' ||
    (SELECT 'legacy='||count(*) FROM cash_drawer_logs WHERE staff_id IN (${uidl}))`);
console.log('STATUS',res.status);
console.log('OUT:',JSON.stringify(res.out));
console.log('ERR:',JSON.stringify(res.err.slice(0,500)));
// run-1 leftovers inspection
console.log('\n--- p8 idem keys ---');
console.log(Sx(`SELECT key, namespace, order_id::text, amount, status, created_at FROM payment_idempotency_keys WHERE key LIKE 'p8:%'`).out);
console.log('\n--- p8 staff remaining? ---');
console.log(Sx(`SELECT id::text, name, is_active, status FROM staff WHERE name LIKE 'P8\\_%'`).out);
console.log('\n--- p8 sessions? ---');
console.log(Sx(`SELECT token, user_id, status FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%')`).out);
console.log('\n--- audit_log record_id type ---');
console.log(Sx(`SELECT data_type FROM information_schema.columns WHERE table_name='audit_log' AND column_name='record_id'`).out);
