import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a server-side Supabase client.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Handled by middleware
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handled by middleware
          }
        },
      },
    }
  );
}

/**
 * Validates session and role.
 */
export async function validateAuth(requiredRoles?: string[]) {
  const supabase = await createAuthClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return { authenticated: false, error: 'Unauthenticated', status: 401 };

  // Role check via user metadata or custom table
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (!profile) return { authenticated: false, error: 'Profile not found', status: 403 };

  if (requiredRoles && !requiredRoles.includes(profile.role)) {
    return { authenticated: false, error: 'Forbidden', status: 403, role: profile.role };
  }

  return { authenticated: true, user: session.user, role: profile.role };
}
