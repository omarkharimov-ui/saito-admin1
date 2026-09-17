// finish run-1 residue: P-3 immutability GUC (P-7 pattern) + overtime_records FK
'use strict';
const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const Sx=sql=>{const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:120000,env:{...process.env,PGPASSWORD:DBPW}});return {status:r.status,out:(r.stdout||'').trim(),err:(r.stderr||'').trim()};};
const STAFF=`(SELECT id FROM staff WHERE name LIKE 'P8\\_%')`;
const STAFF_T=`(SELECT id::text FROM staff WHERE name LIKE 'P8\\_%')`;
const SHIFTS=`(SELECT id FROM shifts WHERE staff_id IN ${STAFF})`;
const ORD=`(SELECT id FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND total_amount=100 AND created_at > '2026-09-17')`;
const ORD_T=`(SELECT id::text FROM orders WHERE table_number=1312 AND location_id='f1f830b3-cf15-47e3-a538-01abd8222c6d' AND total_amount=100 AND created_at > '2026-09-17')`;
// P-7 pattern: single transaction with the trusted ledger-reopen GUC
const txn=`BEGIN;
SELECT set_config('app.payment_ledger_reopen','on',false);
DELETE FROM overtime_records WHERE shift_id IN ${SHIFTS};
DELETE FROM operation_logs WHERE order_id IN ${ORD};
DELETE FROM order_events WHERE order_id IN ${ORD};
DELETE FROM outbox_events WHERE aggregate_id IN ${ORD};
DELETE FROM audit_logs_canonical WHERE entity_id IN ${ORD_T};
DELETE FROM audit_logs WHERE record_id IN ${ORD_T};
DELETE FROM audit_log WHERE record_id IN ${ORD} OR record_id IN ${SHIFTS} OR record_id IN ${STAFF};
DELETE FROM order_payments WHERE order_id IN ${ORD};
DELETE FROM payments WHERE order_id IN ${ORD};
DELETE FROM order_items WHERE order_id IN ${ORD};
DELETE FROM cancelled_orders WHERE order_id IN ${ORD};
DELETE FROM kitchen_schedule WHERE order_id IN ${ORD};
DELETE FROM inventory_logs WHERE order_id IN ${ORD};
DELETE FROM shifts WHERE id IN ${SHIFTS};
DELETE FROM orders WHERE id IN ${ORD};
SELECT set_config('app.payment_ledger_reopen','off',false);
COMMIT;`;
const r=Sx(txn);
console.log('txn status:',r.status); if(r.err)console.log('ERR:',r.err.slice(0,400));
const chk=[
 ['staff_p8_active',`SELECT count(*) FROM staff WHERE name LIKE 'P8\\_%' AND is_active=true`],
 ['shifts_p8',`SELECT count(*) FROM shifts WHERE staff_id IN ${STAFF}`],
 ['orders_1312',`SELECT count(*) FROM orders WHERE table_number=1312`],
 ['op_orphans',`SELECT count(*) FROM order_payments op WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=op.order_id)`],
];
for(const [k,sql] of chk){ const c=Sx(sql); console.log(k+' =',c.out||c.err.slice(0,160)); }
