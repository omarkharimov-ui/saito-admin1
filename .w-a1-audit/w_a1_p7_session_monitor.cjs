// W-A1 diagnostic (2026-09-19): 3s poll of P7 session rows while P-7 half-2 runs.
// Proves WHEN and HOW the fixture sessions become invalid.
const { spawnSync } = require('child_process');
const fs = require('fs');
const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const out = __dirname + '/reflow/P7sessmon.log';
function ps(sql) {
  const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-t', '-A', '-F', ' | ', '-c', sql], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8', timeout: 20000 });
  return (r.stdout || '').trim();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const snap = () => {
    const t = ps(`SELECT to_char(now(),'MMDD HH24:MI:SS')`);
    const sess = ps(`SELECT st.name, s.status, coalesce(to_char(s.revoked_at,'HH24:MI:SS'),'-') FROM sessions s JOIN staff st ON st.id=s.user_id WHERE st.name LIKE 'P7%' ORDER BY 1`);
    const staff = ps(`SELECT name, is_active, status FROM staff WHERE name LIKE 'P7%' AND is_active ORDER BY 1`);
    return t + ' SESS: ' + (sess || '(none)') + ' || ACTIVE-STAFF: ' + (staff || '(none)');
  };
  fs.appendFileSync(out, '=== MONITOR START ' + new Date().toISOString() + ' ===\n' + snap() + '\n');
  let last = '';
  while (true) {
    await sleep(3000);
    const s = snap();
    if (s !== last) { fs.appendFileSync(out, s + '\n'); last = s; }
  }
})();
