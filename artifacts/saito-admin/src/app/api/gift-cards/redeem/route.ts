import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const supabase = await createAuthClient();
    const { code, amount, order_id } = await request.json();

    if (!code || !amount || amount <= 0) {
      return NextResponse.json({ error: 'code and positive amount required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('gift_card_redeem', {
      p_code: code,
      p_amount: amount,
      p_order_id: order_id || null,
      p_performed_by: auth.user?.id || null,
    });

    if (error) throw error;
    if (!data?.success) return NextResponse.json(data, { status: 400 });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
