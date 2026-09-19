// W-A1 diagnostic (2026-09-19): after P-7 half-1, call the exact RPCs half-2 uses
// and print FULL response bodies (the DB fns embed the precise failure reason).
const fs = require('fs');
const { spawnSync } = require('child_process');
const SVC = (fs.readFileSync('artifacts/saito-admin/.env.local', 'utf8').split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')) || '').split('=')[1].trim().replace(/["']/g, '');
const fix = JSON.parse(fs.readFileSync('.p7-fixture.json', 'utf8'));
const MGR = (fix.toks || fix.TOKS || [])[0];
const O11 = fix.oids ? fix.oids[11] : null;
const S = sql => spawnSync('psql', ['-h', 'aws-1-eu-central-1.pooler.supabase.com', '-p', '6543', '-U', 'postgres.jbxmlnsicbfkbsatnoej', '-d', 'postgres', '-t', '-A', '-c', sql], { env: { ...process.env, PGPASSWORD: 'hivhU3-sathob-bupcar' }, encoding: 'utf8' }).stdout.trim();
console.log('fixture oids field:', JSON.stringify(fix.oids || fix.OIDS || 'MISSING').slice(0, 120));
console.log('session row via psql:', S(`SELECT 'found status='||status||' org='||organization_id||' loc='||coalesce(active_location_id::text,'NULL') FROM sessions WHERE token='${MGR}'`) || '(NONE)');
const rpc = async (fn, args) => {
  const r = await fetch('https://jbxmlnsicbfkbsatnoej.supabase.co/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
};
(async () => {
  for (let i = 1; i <= 3; i++) {
    const a = await rpc('set_session_staff', { p_token: MGR });
    console.log(`set_session_staff#${i}:`, a.status, a.body);
  }
  if (O11) {
    const b = await rpc('transition_order_atomic', { p_token: MGR, p_order_id: O11, p_new_status: 'new', p_reason: 'wag diag' });
    console.log('transition_order_atomic(O11):', b.status, b.body);
  }
  const c = await rpc('has_permission', { p_staff_id: (fix.uids || fix.UIDS || [])[0], p_permission: 'orders.edit' });
  console.log('has_permission:', c.status, c.body);
})();
