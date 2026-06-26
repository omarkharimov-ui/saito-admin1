import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('saito_token')?.value;

    if (token) {
      const adminClient = getAdminClient();
      if (adminClient) {
        await adminClient.from('sessions').delete().eq('token', token);
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('saito_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ success: true });
  }
}
