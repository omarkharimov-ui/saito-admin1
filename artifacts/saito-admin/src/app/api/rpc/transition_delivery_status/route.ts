import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    const { data, error } = await supabase.rpc('transition_delivery_status', {
      p_order_id: body.p_order_id,
      p_new_status: body.p_new_status,
      p_courier_id: body.p_courier_id || null,
      p_courier_name: body.p_courier_name || null,
      p_performed_by: body.p_performed_by || null,
      p_performed_by_terminal_id: body.p_performed_by_terminal_id || null,
      p_employee_name: body.p_employee_name || null,
      p_metadata: body.p_metadata || null,
    });

    if (error) {
      console.error('[transition_delivery_status] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[transition_delivery_status] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
