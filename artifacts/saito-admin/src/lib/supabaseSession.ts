import { supabase } from '@/lib/supabase';

/**
 * NOTE: This app uses a custom PIN-based auth system (saito_token cookie + sessions table).
 * Supabase Auth sessions are NOT used. Client-side queries rely on permissive RLS policies
 * (service_role_full_* policies using USING (true)) because the anon key has no authenticated session.
 * 
 * All sensitive operations should go through API routes using the service_role key.
 */
