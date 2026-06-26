import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export async function validateAuth(requiredRoles?: string[]) {
  const supabase = await createAuthClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return { authenticated: false, error: 'Unauthenticated', status: 401 };

  const { data: profile } = await supabase
    .from('admin_users')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile) return { authenticated: false, error: 'Profile not found', status: 403 };

  if (requiredRoles && !requiredRoles.includes(profile.role)) {
    return { authenticated: false, error: 'Forbidden', status: 403, role: profile.role };
  }

  return { authenticated: true, user: session.user, role: profile.role };
}

export async function requireAuth(requiredRoles?: string[]): Promise<any> {
  const auth = await validateAuth(requiredRoles);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return auth;
}

export async function requireRole(requiredRoles: string[]) {
  return validateAuth(requiredRoles);
}
