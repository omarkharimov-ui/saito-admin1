/**
 * Run once to seed admin_users table:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-admin-users.mjs
 *
 * Edit emails/passwords below before running.
 */
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jbxmlnsicbfkbsatnoej.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌  Set SUPABASE_SERVICE_ROLE_KEY env var first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  { email: 'superadmin@saito.az', password: 'saito2025',  role: 'superadmin' },
  { email: 'admin@saito.az',      password: 'admin123',   role: 'admin'      },
  { email: 'kitchen@saito.az',    password: 'kitchen123', role: 'kitchen'    },
];

for (const u of USERS) {
  const hash = await bcrypt.hash(u.password, 12);
  const { error } = await supabase.from('admin_users').upsert(
    { email: u.email, password_hash: hash, role: u.role, is_active: true },
    { onConflict: 'email' }
  );
  if (error) {
    console.error(`❌  ${u.email}:`, error.message);
  } else {
    console.log(`✅  ${u.role} — ${u.email}`);
  }
}
