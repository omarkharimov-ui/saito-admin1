import { supabase } from '@/lib/supabase';

type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
};

/** API login cavabındakı session-u brauzer Supabase client-ə yazır (RLS üçün authenticated rol). */
export async function applySupabaseSession(
  session: AuthSessionPayload | null | undefined
): Promise<boolean> {
  if (!session?.access_token || !session?.refresh_token) return false;
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) {
    console.error('[applySupabaseSession]', error.message);
    return false;
  }
  return true;
}
