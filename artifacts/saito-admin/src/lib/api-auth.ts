import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function validateAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('saito_token')?.value;

  if (!token) return { authenticated: false, error: 'Unauthenticated', status: 401 };

  const supabase = svc();
  const { data: session } = await supabase
    .from('sessions')
    .select('user_id, role, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!session) return { authenticated: false, error: 'Invalid session', status: 401 };

  if (new Date(session.expires_at).getTime() < Date.now()) {
    try {
      await supabase.from('security_events').insert({
        staff_id: session.user_id,
        event_type: 'session_expired',
        success: false,
        metadata: { reason: 'token_expired' },
      });
    } catch { /* non-critical */ }
    await supabase.from('sessions').delete().eq('token', token);
    return { authenticated: false, error: 'Session expired', status: 401 };
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('is_active')
    .eq('id', session.user_id)
    .maybeSingle();

  if (!staff?.is_active) {
    try {
      await supabase.from('security_events').insert({
        staff_id: session.user_id,
        event_type: 'account_disabled',
        success: false,
        metadata: { reason: 'staff_inactive' },
      });
    } catch { /* non-critical */ }
    await supabase.from('sessions').delete().eq('token', token);
    return { authenticated: false, error: 'Account disabled', status: 401 };
  }

  return {
    authenticated: true,
    user: { id: session.user_id },
    role: session.role,
  };
}

export async function requireAuth(): Promise<any> {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return auth;
}

export function sanitizeStaff(staff: any): any {
  if (!staff || typeof staff !== 'object') return staff;
  const { pin_hash, ...rest } = staff;
  return rest;
}

export function sanitizeStaffArray(staffList: any[]): any[] {
  return staffList.map(s => sanitizeStaff(s));
}

export async function requirePermission(permission: string): Promise<any> {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = svc();
  const { data, error } = await supabase.rpc('has_permission', {
    p_staff_id: auth.user!.id,
    p_permission: permission,
  });
  if (error || !data) {
    try {
      await supabase.from('security_events').insert({
        staff_id: auth.user!.id,
        event_type: 'permission_denied',
        success: false,
        metadata: { permission, error: error?.message || 'denied' },
      });
    } catch { /* non-critical */ }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return auth;
}

export async function createAuthClient() {
  return svc();
}
