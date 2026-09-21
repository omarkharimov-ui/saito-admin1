import { createClient } from '@supabase/supabase-js';
import { verifyPin } from '@/lib/crypto';

// QF3: manager-level PIN verification (shared by shift-locked routes).
// Accepts staff whose role is one of MANAGER_ROLES; rate-limited + audited.
const MANAGER_ROLES = ['admin', 'manager', 'owner', 'superadmin'];

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface ManagerPinResult {
  ok: boolean;
  role?: string;
  staffId?: string;
  name?: string;
  error?: string;
}

export async function verifyManagerPin(pin: string, ip = 'unknown'): Promise<ManagerPinResult> {
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return { ok: false, error: 'PIN formatı yanlışdır' };
  }
  const supabase = svc();

  const { data: rlCheck } = await supabase.rpc('check_login_rate_limit', {
    p_identifier: `manager-pin:${ip}`,
    p_ip: ip,
    p_max_attempts: 5,
    p_window_seconds: 900,
  });
  if (rlCheck && !rlCheck.allowed) {
    await supabase.rpc('record_login_attempt', {
      p_identifier: `manager-pin:${ip}`,
      p_ip: ip,
      p_success: false,
    });
    return { ok: false, error: rlCheck.error };
  }

  const { data: staffUsers } = await supabase
    .from('staff')
    .select('id, name, role_id, pin_hash')
    .eq('is_active', true)
    .not('pin_hash', 'is', null)
    .limit(100);

  const match = (staffUsers || []).find((u: any) => u.pin_hash && verifyPin(pin, u.pin_hash));
  if (!match) {
    await supabase.rpc('record_login_attempt', {
      p_identifier: `manager-pin:${ip}`,
      p_ip: ip,
      p_success: false,
    });
    return { ok: false, error: 'PIN yanlışdır' };
  }

  let role = 'cashier';
  if (match.role_id) {
    const { data: roleRow } = await supabase.from('roles').select('name').eq('id', match.role_id).maybeSingle();
    if (roleRow?.name) role = roleRow.name;
  }

  if (!MANAGER_ROLES.includes(role)) {
    await supabase.rpc('record_login_attempt', {
      p_identifier: `manager-pin:${ip}`,
      p_ip: ip,
      p_success: false,
    });
    return { ok: false, error: 'Bu əməliyyat üçün idarəçi PIN-i tələb olunur' };
  }

  await supabase.rpc('record_login_attempt', {
    p_identifier: `manager-pin:${ip}`,
    p_ip: ip,
    p_success: true,
  });

  return { ok: true, role, staffId: match.id, name: match.name };
}
