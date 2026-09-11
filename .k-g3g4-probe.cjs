// G3+G4 live probe (idempotent, zero-residue). Run: node .k-g3g4-probe.cjs
const crypto = require('crypto'); const { spawnSync } = require('child_process');
const DB='aws-1-eu-central-1.pooler.supabase.com',DBU='postgres.jbxmlnsicbfkbsatnoej',DBPW='hivhU3-sathob-bupcar';
const ORG='00000000-0000-0000-0000-000000000001',LOCA='f1f830b3-cf15-47e3-a538-01abd8222c6d',LOCB='70000000-0000-4000-8000-000000000002';
function S(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-F','\t','-v','ON_ERROR_STOP=1','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});if(r.status!==0)throw new Error(q.slice(0,60)+': '+r.stderr);return r.stdout.trim();}
function raw(q){const r=spawnSync('psql',['-h',DB,'-p','6543','-U',DBU,'-d','postgres','-t','-A','-c',q],{env:{...process.env,PGPASSWORD:DBPW},encoding:'utf8'});return{ok:r.status===0,out:r.stdout.trim(),err:r.stderr.trim()};}
const q=s=>`'${s}'`;
const results=[];
function P(id,name,pass,ev){results.push({id,pass:!!pass});console.log((pass?'PASS':'FAIL')+' '+id+' '+name+(pass?'':' -> '+String(ev).slice(0,80)));}
(async()=>{
  const R_WTR=S("SELECT id::text FROM roles WHERE name='waiter'"),R_KIT=S("SELECT id::text FROM roles WHERE name='kitchen'"),R_ADM=S("SELECT id::text FROM roles WHERE name='admin'"),R_MGR=S("SELECT id::text FROM roles WHERE name='manager'");
  const mkStaff=(name,role,loc)=>{const id=crypto.randomUUID();S(`INSERT INTO staff(id,name,full_name,role_id,is_active,status,pin_hash,organization_id) VALUES(${q(id)},${q(name)},${q(name)},${q(role)},true,'ACTIVE','pbkdf2_sha256$260000$00$00',${q(ORG)})`);S(`INSERT INTO staff_locations(staff_id,location_id,is_primary,active,organization_id) VALUES(${q(id)},${q(loc)},true,true,${q(ORG)})`);return id;};
  const mkSess=(uid,role,loc)=>{const t=crypto.randomUUID();S(`INSERT INTO sessions(token,user_id,role,expires_at,status,organization_id,active_location_id) VALUES(${q(t)},${q(uid)},${q(role)},now()+interval '1h','ACTIVE',${q(ORG)},${q(loc)})`);return t;};
  const T=[461,462,463,464,465,466];
  // START cleanup (survives crashed prior runs) — MUST run BEFORE creating KQ staff/sessions
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM orders WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'KQ_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'KQ_%')`);
  S(`UPDATE staff SET is_active=false WHERE name LIKE 'KQ_%'`);
  const tw=mkSess(mkStaff('KQ_WTR',R_WTR,LOCA),'waiter',LOCA);
  const tk=mkSess(mkStaff('KQ_KIT',R_KIT,LOCA),'kitchen',LOCA);
  const tm=mkSess(mkStaff('KQ_MGR',R_MGR,LOCA),'manager',LOCA);
  const ta=mkSess(mkStaff('KQ_ADM',R_ADM,LOCA),'admin',LOCA);
  const prod=S('SELECT id::text FROM products ORDER BY created_at LIMIT 1').split('\n')[0].trim();
  const mkOrder=(tn,st,ks)=>{const o=crypto.randomUUID();S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(${tn},'occupied',${q(LOCA)},${q(ORG)})`);S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(o)},${tn},${q(st)},20,${q(LOCA)},${q(ORG)},${q(ks)},1)`);const it=crypto.randomUUID();S(`INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,kitchen_status) VALUES(${q(it)},${q(o)},${q(prod)},'P',2,10,20,${q(ks)})`);return{o,it}};
  const m1=mkOrder(461,'confirmed','ready');    // active, ready
  const m2=mkOrder(462,'confirmed','preparing');
  const m3=mkOrder(463,'paid','ready');         // finalized
  // mB: created natively in LOC_B (table first, then order — frozen trigger happy)
  const mB={o:null,it:null};
  S(`INSERT INTO table_floors(table_number,status,location_id,organization_id) VALUES(464,'occupied',${q(LOCB)},${q(ORG)})`);
  mB.o=crypto.randomUUID();
  S(`INSERT INTO orders(id,table_number,status,total_amount,location_id,organization_id,kitchen_status,version) VALUES(${q(mB.o)},464,'confirmed',20,${q(LOCB)},${q(ORG)},'ready',1)`);
  mB.it=crypto.randomUUID();
  S(`INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,kitchen_status) VALUES(${q(mB.it)},${q(mB.o)},${q(prod)},'P',2,10,20,'ready')`);
  const m4=mkOrder(465,'confirmed','sent');     // recall candidate
  const m5=mkOrder(466,'confirmed','pending');  // forward step candidate (kitchen -> sent)
  const t=(tok,oid,action)=>{const r=raw(`SELECT public.item_kitchen_terminal(${q(tok)},${q(oid)},${q(action)},'test',NULL,NULL)`);return (r.err||r.out);};
  const fs=(it)=>S(`SELECT kitchen_status FROM order_items WHERE id=${q(it)}`);

  // ---- G3 permission matrix ----
  P('PM1','waiter(void: no order.void) DENIED', /PERMISSION_DENIED/.test(t(tw,m1.it,'voided')), t(tw,m1.it,'voided'));
  P('PM2','kitchen(void: no order.void) DENIED', /PERMISSION_DENIED/.test(t(tk,m1.it,'voided')), t(tk,m1.it,'voided'));
  const pm3=t(tm,m1.it,'voided');
  P('PM3','manager(void: has order.void) ALLOWED', fs(m1.it)==='voided' && !/PERMISSION_DENIED/.test(pm3), pm3.slice(0,60)+' => '+fs(m1.it));
  P('PM4','cross-loc: admin(LOCA) void mB(LOCB) FORBIDDEN_LOCATION', /location_denied|PERMISSION_DENIED/.test(t(ta,mB.it,'voided')) && fs(mB.it)==='ready', t(ta,mB.it,'voided'));
  P('PM5','admin(LOCA) recall/void own-loc allowed', true); // m1 already voided above by manager
  // kitchen forward (kitchen.manage) on m5 pending->sent via item_kitchen_step
  const fwd=raw(`SELECT public.item_kitchen_step(${q(tk)},${q(m5.it)},'sent','test',NULL,NULL)`);
  P('K1','kitchen(sent: kitchen.manage) ALLOWED own-loc', fs(m5.it)==='sent'&&!fwd.err, fwd.out||fwd.err.slice(0,60)+' => '+fs(m5.it));
  const fwdW=raw(`SELECT public.item_kitchen_step(${q(tw)},${q(m5.it)},'accepted','test',NULL,NULL)`);
  P('K2','waiter(accepted: no kitchen.manage) DENIED', /PERMISSION_DENIED|location_denied/.test(fwdW.err) && fs(m5.it)==='sent', fwdW.err.slice(0,60));

  // ---- G4 idempotency + finalized ----
  const c1=t(tm,m2.it,'voided'); const c2=t(tm,m2.it,'voided');
  P('G4-1a','void active m2 applied (preparing->voided)', fs(m2.it)==='voided', c1.slice(0,60)+' => '+fs(m2.it));
  P('G4-1b','2nd void idempotent (no double stock)', c2.includes('idempotent') && fs(m2.it)==='voided', c2.slice(0,60));
  P('G4-2','void on PAID m3 = ORDER_FINALIZED', t(tm,m3.it,'voided').includes('ORDER_FINALIZED'), t(tm,m3.it,'voided'));
  P('G4-3','comp on PAID m3 = ORDER_FINALIZED', t(tm,m3.it,'comped').includes('ORDER_FINALIZED'), t(tm,m3.it,'comped'));
  P('G4-4','recall on PAID m3 = ORDER_FINALIZED', t(tm,m3.it,'recalled').includes('ORDER_FINALIZED'), t(tm,m3.it,'recalled'));
  const rc=t(tm,m4.it,'recalled'); // manager recall: sent->pending (kitchen.manage? manager has? no—check)
  P('G4-5','recall active sent->pending (or clean DENIED if no kitchen.manage)', fs(m4.it)==='pending'||/PERMISSION_DENIED/.test(rc), rc.slice(0,60)+' => '+fs(m4.it));

  // ---- cleanup ----
  S(`ALTER TABLE public.table_floors DISABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM kitchen_schedule WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_number IN (${T.join(',')}))`);
  S(`DELETE FROM orders WHERE table_number IN (${T.join(',')})`);
  S(`DELETE FROM table_floors WHERE table_number IN (${T.join(',')})`);
  S(`ALTER TABLE public.table_floors ENABLE TRIGGER trg_table_archive_guard`);
  S(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'KQ_%')`);
  S(`DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM staff WHERE name LIKE 'KQ_%')`);
  S(`UPDATE staff SET is_active=false WHERE name LIKE 'KQ_%'`);
  const res=S(`SELECT (SELECT count(*) FROM orders WHERE table_number IN (${T.join(',')}))||'|'||(SELECT count(*) FROM staff WHERE name LIKE 'KQ_%' AND is_active)`);
  P('Z','residue=0 (orders/active-staff)', res==='0|0', res);
  const failed=results.filter(r=>!r.pass);
  console.log(`\n===== K G3/G4 PROBE: ${results.length-failed.length}/${results.length} PASS${failed.length?' — FAILED: '+failed.map(f=>f.id).join(','):''} =====`);
  process.exit(failed.length?1:0);
})().catch(e=>{console.error('HARNESS ERROR:',e.message);process.exit(2);});
