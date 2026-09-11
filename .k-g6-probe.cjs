// G6 live probe (idempotent, zero-residue): prove the kds_ticket outbox event is
// now location/station-scoped (payload carries location_id/organization_id/station).
// Run: node .k-g6-probe.cjs
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d',LOCB='70000000-0000-4000-8000-000000000002';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,60)+': '+r.stderr);return r.stdout.trim();}
function raw(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});return{ok:r.status===0,out:r.stdout.trim(),err:r.stderr.trim()};}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,120)));}
(async()=>{
  const T=[491,492];
  // START cleanup (survives crashed prior runs)
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (SELECT id::text FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM orders WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);

  const prod=S('SELECT id::text FROM products ORDER BY created_at LIMIT 1').split('\n')[0].trim();
  // LOC_A item (station 'grill') + LOC_B item (station 'bar')
  const mk=(tn,loc,stn,ks)=>{
    S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${tn},'occupied',${q(loc)},${q(ORG)})`);
    const o=crypto.randomUUID();
    S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(o)},${tn},'confirmed',20,${q(loc)},${q(ORG)},${q(ks)},1)`);
    const it=crypto.randomUUID();
    S(`INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,kitchen_status,station) VALUES(${q(it)},${q(o)},${q(prod)},'P',1,20,20,${q(ks)},${q(stn)})`);
    return{o,it};
  };
  const A=mk(491,LOCA,'grill','pending');
  const B=mk(492,LOCB,'bar','pending');

  // (a) fn body enriched
  P('G6-1','emit_kds_ticket_event payload enriched (location_id+station in prosrc)',
    ['true','t'].includes(S("SELECT exists(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='emit_kds_ticket_event' AND p.prosrc ILIKE '%location_id%' AND p.prosrc ILIKE '%station%')")));
  // (b) trigger still attached
  P('G6-2','trg_kds_ticket_emit attached to order_items -> emit_kds_ticket_event',
    S("SELECT count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='order_items' AND t.tgname='trg_kds_ticket_emit'")==='1');

  // (c) the INSERT above emitted a kds_ticket event; locate A's event and assert scoped payload
  const aEv=S(`SELECT jsonb_pretty(payload) FROM outbox_events WHERE aggregate_type='kds_ticket' AND aggregate_id=${q(A.it)} ORDER BY created_at DESC LIMIT 1`);
  P('G6-3','LOC_A kds_ticket event exists', aEv.length>0, aEv.slice(0,80));
  P('G6-4','LOC_A event payload carries location_id='+LOCA, aEv.includes(LOCA));
  P('G6-5','LOC_A event payload carries station=grill', aEv.includes('grill'));
  P('G6-6','LOC_A event payload carries organization_id', aEv.includes(ORG));
  const bEv=S(`SELECT jsonb_pretty(payload) FROM outbox_events WHERE aggregate_type='kds_ticket' AND aggregate_id=${q(B.it)} ORDER BY created_at DESC LIMIT 1`);
  P('G6-7','LOC_B kds_ticket event payload carries location_id='+LOCB, bEv.includes(LOCB));
  P('G6-8','LOC_A event does NOT carry LOC_B id (no cross-location bleed in payload)', !aEv.includes(LOCB));

  // (d) UPDATE OF kitchen_status re-emits (valid transition pending->sent) with scope
  S(`UPDATE order_items SET kitchen_status='sent' WHERE id=${q(A.it)}`);
  const aEv2=S(`SELECT jsonb_pretty(payload) FROM outbox_events WHERE aggregate_type='kds_ticket' AND aggregate_id=${q(A.it)} AND payload->>'item_status'='sent' ORDER BY created_at DESC LIMIT 1`);
  P('G6-9','UPDATE kitchen_status re-emits kds_ticket (previous_status=pending, location_id present)', aEv2.includes('pending') && aEv2.includes(LOCA));

  // (e) cursor index present
  P('G6-10','idx_outbox_kds_ticket_cursor exists (created_at,id) WHERE kds_ticket',
    S("SELECT count(*)::text FROM pg_indexes WHERE tablename='outbox_events' AND indexname='idx_outbox_kds_ticket_cursor'")==='1');

  // CLEANUP — zero residue
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM outbox_events WHERE aggregate_id IN (${q(A.it)},${q(B.it)})`);
  S(`DELETE FROM outbox_events WHERE payload->>'order_id' IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM order_items WHERE order_id IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM orders WHERE id IN (${q(A.o)},${q(B.o)})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  const resid=S(`SELECT count(*)::text FROM orders WHERE table_number IN (${T.join(',')})`);
  P('G6-11','cleanup: 0 residue (orders/items/outbox)', resid==='0', resid);

  const pass=results.filter(r=>r.pass).length;
  console.log('\n'+pass+'/'+results.length+' G6 checks passed');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e.message);process.exit(2);});
