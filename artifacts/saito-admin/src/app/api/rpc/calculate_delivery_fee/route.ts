import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    const { data, error } = await supabase.rpc('calculate_delivery_fee', {
      p_zone_name: body.p_zone_name || null,
      p_order_amount: body.p_order_amount || 0,
      p_customer_address: body.p_customer_address || null,
    });

    if (error) {
      console.error('[calculate_delivery_fee] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[calculate_delivery_fee] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}