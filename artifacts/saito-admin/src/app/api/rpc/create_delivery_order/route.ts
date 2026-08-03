import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

/**
 * Creates a new delivery (Çatdırma) order via DB RPC.
 * Generates order number, creates order + items + delivery fields, returns order_id.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    const { data, error } = await supabase.rpc('create_delivery_order', {
      p_customer_phone: body.p_customer_phone || null,
      p_customer_name: body.p_customer_name || null,
      p_customer_note: body.p_customer_note || null,
      p_delivery_address: body.p_delivery_address || null,
      p_delivery_fee: body.p_delivery_fee || 0,
      p_estimated_delivery_time: body.p_estimated_delivery_time || null,
      p_items: body.p_items || [],
      p_performed_by: auth.user?.id || null,
    });

    if (error) {
      console.error('[create_delivery_order] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[create_delivery_order] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
