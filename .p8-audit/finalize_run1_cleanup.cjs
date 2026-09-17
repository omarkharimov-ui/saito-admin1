// finish run-1 residue removal (corrected text/uuid handling, per-statement, errors surfaced)
'use strict';
const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim(),err:(r.stderr||'').trim()};};
const STAFF=`(SELECT id FROM staff WHERE name LIKE 'P8\\_%')`;
const STAFF_T=`(SELECT id::text FROM staff WHERE name LIKE 'P8\\_%')`;
const SHIFTS=`(SELECT id FROM shifts WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%'))`;
const SHIFTS_T=`(SELECT id::text FROM shifts WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%'))`;
const SESS=`(SELECT id FROM cash_drawer_sessions WHERE opened_by IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%'))`;
const SESS_T=`(SELECT id::text FROM cash_drawer_sessions WHERE opened_by IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%'))`;
const ORD=`(SELECT id FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND total_amount=100 AND created_at > '2026-09-17')`;
const ORD_T=`(SELECT id::text FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND total_amount=100 AND created_at > '2026-09-17')`;
// 1) close any open P8 drawer at diff 0
const openSid=Sx(`SELECT d.id FROM cash_drawer_sessions d WHERE d.opened_by IN ${STAFF} AND d.status='open'`).out;
if(openSid){ for(const sid of openSid.split('\n').filter(Boolean)){ const exp=Sx(`SELECT public.cash_session_expected('${sid}')`).out; Sx(`SELECT public.close_cash_register_v2('${sid}',${exp},'p8 run1 teardown',NULL,NULL)`); console.log('closed open session',sid.slice(0,8),exp); } }
const stmts=[
 // text-id audit tables (text subqueries, no casts)
 `DELETE FROM audit_logs_canonical WHERE entity_id IN ${STAFF_T} OR entity_id IN ${SHIFTS_T} OR entity_id IN ${SESS_T} OR entity_id IN ${ORD_T}`,
 `DELETE FROM audit_logs WHERE record_id IN ${STAFF_T} OR record_id IN ${SHIFTS_T} OR record_id IN ${SESS_T} OR record_id IN ${ORD_T}`,
 // uuid-id tables (uuid subqueries)
 `DELETE FROM cash_drawer_log WHERE session_id IN ${SESS} OR created_by IN ${STAFF}`,
 `DELETE FROM outbox_events WHERE aggregate_id IN ${SHIFTS} OR aggregate_id IN ${SESS} OR aggregate_id IN ${ORD}`,
 `DELETE FROM cash_drawer_logs WHERE staff_id IN ${STAFF}`,
 `DELETE FROM shift_breaks WHERE shift_id IN ${SHIFTS}`,
 `DELETE FROM time_clock_entries WHERE staff_id IN ${STAFF}`,
 `DELETE FROM time_clock_audit WHERE performed_by IN ${STAFF}`,
 `DELETE FROM security_events WHERE staff_id IN ${STAFF}`,
 `DELETE FROM operation_logs WHERE order_id IN ${ORD}`,
 `DELETE FROM order_events WHERE order_id IN ${ORD}`,
 `DELETE FROM order_payments WHERE order_id IN ${ORD}`,
 `DELETE FROM payments WHERE order_id IN ${ORD}`,
 `DELETE FROM order_items WHERE order_id IN ${ORD}`,
 `DELETE FROM orders WHERE id IN ${ORD}`,
 `DELETE FROM audit_log WHERE record_id IN ${STAFF} OR record_id IN ${SHIFTS} OR record_id IN ${SESS} OR record_id IN ${ORD}`,
 `DELETE FROM shifts WHERE id IN ${SHIFTS}`,
 `DELETE FROM cash_drawer_sessions WHERE id IN ${SESS}`,
 `DELETE FROM products WHERE name='P8_PROD'`,
];
let fail=0;
for(const s of stmts){ const r=Sx(s); if(r.status!==0){fail++;console.log('ABORT: '+s.slice(0,80)+'\n  ERR: '+r.err.slice(0,200));} else {console.log('ok: '+s.slice(0,80));} }
console.log('\nfailures:',fail);
const chk=[
 ['staff_p8',`SELECT count(*) FROM staff WHERE name LIKE 'P8\\_%'`],
 ['inactive_p8',`SELECT count(*) FROM staff WHERE name LIKE 'P8\\_%' AND is_active=true`],
 ['shifts_p8',`SELECT count(*) FROM shifts WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%')`],
 ['sessions_p8',`SELECT count(*) FROM cash_drawer_sessions WHERE opened_by IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%')`],
 ['log_p8',`SELECT count(*) FROM cash_drawer_log WHERE created_by IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%')`],
 ['orders_1312',`SELECT count(*) FROM orders WHERE table_number=1312`],
 ['idem_p8',`SELECT count(*) FROM payment_idempotency_keys WHERE key LIKE 'p8:%'`],
 ['legacy_p8',`SELECT count(*) FROM cash_drawer_logs WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%')`],
];
for(const [k,sql] of chk){ console.log(k+' =',Sx(sql).out||Sx(sql).err.slice(0,120)); }
