import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// 2026-09-24 (owner, Toast "print Z at any time"): the browser POS session is a
// custom PIN token (no Supabase JWT), so a client-side supabase.rpc hits the DB
// as `anon` and get_z_report denies it. Call the read-only RPC server-side
// with the service role, exactly like the other /api/finance report routes.
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const supabase = await createAuthClient();
    const { data, error } = await supabase.rpc('get_z_report', {
      p_date: date || undefined,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
