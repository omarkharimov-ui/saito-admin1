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

export async function validateAuth(requiredRoles?: string[]) {
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
    await supabase.from('sessions').delete().eq('token', token);
    return { authenticated: false, error: 'Session expired', status: 401 };
  }

  if (requiredRoles && !requiredRoles.includes(session.role)) {
    return { authenticated: false, error: 'Forbidden', status: 403, role: session.role };
  }

  return {
    authenticated: true,
    user: { id: session.user_id },
    role: session.role,
  };
}

export async function requireAuth(requiredRoles?: string[]): Promise<any> {
  const auth = await validateAuth(requiredRoles);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return auth;
}

export async function createAuthClient() {
  return svc();
}
