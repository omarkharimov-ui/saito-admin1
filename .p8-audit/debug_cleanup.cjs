// debug: surface the cleanup-txn aborting statement + check P8 staff rows
'use strict';
const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim().split('\n')[0]||'',err:(r.stderr||'').trim()};};
console.log('--- all P8 staff (no name filter issues) ---');
console.log(Sx(`SELECT id::text, name, is_active, status FROM staff WHERE name LIKE 'P8%' OR name LIKE 'P8\\_%'`).out || '(none)');
// simulate the run-1 cleanup txn statement-by-statement (idempotent now; surface first error)
const UIDS=['f6f318f9-8b27-44ba-bca5-5fac36525889']; // P8_S0 (only survivor) — S1/S2 ids unknown, use name-based sets
const uidl=`(SELECT id FROM staff WHERE name LIKE 'P8\\_%')`;
const stmts=[
 `DELETE FROM payment_idempotency_keys WHERE key LIKE 'p8:%'`,
 `DELETE FROM cash_drawer_log WHERE created_by IN ${uidl}`,
 `DELETE FROM outbox_events WHERE aggregate_type='shift' AND aggregate_id IN (SELECT id FROM shifts WHERE staff_id IN ${uidl})`,
 `DELETE FROM audit_logs_canonical WHERE entity_id IN ${uidl} OR entity_id IN (SELECT id FROM shifts WHERE staff_id IN ${uidl})`,
 `DELETE FROM audit_logs WHERE record_id IN (SELECT id FROM shifts WHERE staff_id IN ${uidl})`,
 `DELETE FROM cash_drawer_logs WHERE staff_id IN ${uidl}`,
 `DELETE FROM shift_breaks WHERE staff_id IN ${uidl}`,
 `DELETE FROM time_clock_entries WHERE staff_id IN ${uidl}`,
 `DELETE FROM time_clock_audit WHERE performed_by IN ${uidl}`,
 `DELETE FROM security_events WHERE staff_id IN ${uidl}`,
 `DELETE FROM operation_logs WHERE order_id=(SELECT id FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND paid_amount=100 AND total_amount=100)`,
 `DELETE FROM order_events WHERE order_id=(SELECT id FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND paid_amount=100 AND total_amount=100)`,
 `DELETE FROM order_payments WHERE order_id=(SELECT id FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND paid_amount=100 AND total_amount=100)`,
 `DELETE FROM payments WHERE order_id=(SELECT id FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND paid_amount=100 AND total_amount=100)`,
 `DELETE FROM order_items WHERE order_id=(SELECT id FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND paid_amount=100 AND total_amount=100)`,
 `DELETE FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND paid_amount=100 AND total_amount=100`,
 `DELETE FROM audit_log WHERE record_id IN ${uidl} OR record_id IN (SELECT id FROM shifts WHERE staff_id IN ${uidl})`,
 `DELETE FROM shifts WHERE staff_id IN ${uidl}`,
 `DELETE FROM cash_drawer_sessions WHERE opened_by IN ${uidl}`,
 `DELETE FROM products WHERE name='P8_PROD'`,
];
let aborted=false;
for(const s of stmts){
  const r=Sx(s);
  if(r.status!==0){ console.log('ABORT AT: '+s.slice(0,90)+'\n  ERR: '+r.err.slice(0,300)); aborted=true; break; }
  console.log('ok: '+s.slice(0,90));
}
if(!aborted) console.log('all cleanup statements ok');
console.log('\n--- leftovers after manual cleanup ---');
console.log(Sx(`SELECT 'orders_1312='||count(*) FROM orders WHERE table_number=1312`).out);
console.log(Sx(`SELECT 'shifts_p8='||count(*) FROM shifts WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'P8\\_%')`).out);
console.log(Sx(`SELECT 'staff_p8='||count(*) FROM staff WHERE name LIKE 'P8\\_%'`).out);
console.log(Sx(`SELECT 'idem_p8='||count(*) FROM payment_idempotency_keys WHERE key LIKE 'p8:%'`).out);
