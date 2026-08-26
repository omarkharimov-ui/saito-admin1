import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager', 'cashier']);
  if (!auth.authenticated) return auth;

  try {
    const supabase = await createAuthClient();
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const status = searchParams.get('status') || 'active';

    let query = supabase.from('gift_cards').select('*').eq('status', status).order('created_at', { ascending: false });
    if (code) query = query.ilike('code', code);

    const { data, error } = await query.limit(100);
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;

  try {
    const supabase = await createAuthClient();
    const { code, initial_balance, issued_to_name, expires_at } = await request.json();

    if (!code || !initial_balance || initial_balance <= 0) {
      return NextResponse.json({ error: 'code and positive initial_balance required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('gift_card_issue', {
      p_code: code,
      p_initial_balance: initial_balance,
      p_issued_to: null,
      p_issued_to_name: issued_to_name || null,
      p_issued_by: auth.user?.id || null,
      p_expires_at: expires_at || null,
    });

    if (error) throw error;
    if (!data?.success) return NextResponse.json(data, { status: 400 });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
