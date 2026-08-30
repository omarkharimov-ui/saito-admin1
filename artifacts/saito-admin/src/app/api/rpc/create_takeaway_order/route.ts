import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

/**
 * Creates a new takeaway (Gel-Al) order via DB RPC.
 * Generates order number, creates order + items, returns order_id.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    const { data, error } = await supabase.rpc('create_takeaway_order', {
      p_customer_phone: body.p_customer_phone || null,
      p_customer_name: body.p_customer_name || null,
      p_customer_note: body.p_customer_note || null,
      p_estimated_pickup_time: body.p_estimated_pickup_time || null,
      p_items: body.p_items || [],
      p_performed_by: auth.user?.id || null,
    });

    if (error) {
      console.error('[create_takeaway_order] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[create_takeaway_order] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
