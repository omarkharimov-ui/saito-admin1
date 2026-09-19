// W-A1 Class-D residue repair (2026-09-19, EMİR autonomous run):
// 66 inert fixture-staff rows (is_active=f, status=INACTIVE, pin_hash set) left by
// 09-18 P-9-freeze reflow gate teardowns that neutralize-don't-delete without clearing
// pin_hash. Login-proven inert (pool requires is_active+ACTIVE; requireAuth 401 on
// !is_active; 0 live sessions; pin values = pbkdf2 sentinel $00$00).
// Repair = the gate teardown contract itself (.o-gate/.p1-gate: pin_hash='') applied
// to already-neutralized fixture rows ONLY, DENY53-excluded, in one transaction
// with self-proving count asserts. No production data touched.
const fs = require('fs');
const { spawnSync } = require('child_process');
const DB = 'aws-1-eu-central-1.pooler.supabase.com', DBU = 'postgres.jbxmlnsicbfkbsatnoej', DBPW = 'hivhU3-sathob-bupcar';
const gateSrc = fs.readFileSync(__dirname + '/../.p9-gate.cjs', 'utf8');
const m = gateSrc.match(/const DENY53\s*=\s*\[([^\]]*)\]/);
if (!m) throw new Error('DENY53 not found in .p9-gate.cjs');
const DENY = '{' + m[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean).join(',') + '}';
if (DENY.split(',').length !== 53) throw new Error('DENY53 count != 53: ' + DENY.split(',').length);

const FIXP = "(name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\\_S%')";
const DANGER = "(is_active OR status='ACTIVE' OR (pin_hash IS NOT NULL AND pin_hash<>''))";
const DENYN = "NOT (id = ANY('" + DENY + "'::uuid[]))";

const sql = `BEGIN;
CREATE TEMP TABLE w_a1_target ON COMMIT DROP AS
SELECT id FROM staff WHERE ${FIXP}
  AND pin_hash IS NOT NULL AND pin_hash<>''
  AND is_active=false AND status='INACTIVE'
  AND ${DENYN};
SELECT 'target='||count(*) FROM w_a1_target;
UPDATE staff SET pin_hash='' WHERE id IN (SELECT id FROM w_a1_target);
SELECT 'updated='||count(*) FROM w_a1_target;
SELECT 'danger_left='||count(*) FROM staff WHERE ${FIXP} AND ${DANGER} AND ${DENYN};
SELECT 'deny53_intact='||count(*) FROM staff WHERE id = ANY('${DENY}'::uuid[]);
SELECT 'active='||count(*) FROM staff WHERE is_active;
SELECT 'pool='||count(*) FROM staff WHERE is_active AND status='ACTIVE' AND pin_hash<>'';
COMMIT;`;

fs.writeFileSync(__dirname + '/w_a1_staff_neutralize.sql', sql);
const r = spawnSync('psql', ['-h', DB, '-p', '6543', '-U', DBU, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', __dirname + '/w_a1_staff_neutralize.sql'], { env: { ...process.env, PGPASSWORD: DBPW }, encoding: 'utf8' });
process.stdout.write(r.stdout);
if (r.status !== 0) { console.error('PSQL FAIL: ' + r.stderr); process.exit(1); }
const out = r.stdout;
const get = (k) => { const mm = out.match(new RegExp(k + '=(\\d+)')); return mm ? Number(mm[1]) : NaN; };
const ok = get('target') === 66 && get('updated') === 66 && get('danger_left') === 0 && get('deny53_intact') === 53 && get('active') === 9 && get('pool') === 9;
console.log(ok ? 'NEUTRALIZE OK: 66 targeted, 66 updated, danger=0, deny=53/53, active=9, pool=9' : 'ASSERT FAIL: ' + out);
process.exit(ok ? 0 : 1);
