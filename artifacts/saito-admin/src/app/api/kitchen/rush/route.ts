import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/kitchen/rush
 * 12q (kitchen gap sweep, Toast/Square/Lightspeed parity): RUSH toggle for
 * the KDS. toggle_rush flips orders.is_rush (no actor arg — the guard
 * provides identity + location scope + kitchen.manage). The response echoes
 * the new flag (the RPC returns nothing) so the client can confirm.
 */
export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();
    if (!order_id) return NextResponse.json({ error: 'order_id is required' }, { status: 400 });

    const g = await requireKdsAction({ order_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data, error } = await supabase.rpc('toggle_rush', { order_id });
    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      if (m.includes('ORDER_FINALIZED')) return NextResponse.json({ success: false, error: 'ORDER_FINALIZED' }, { status: 409 });
      return NextResponse.json({ error: m }, { status: 500 });
    }
    void data;
    const { data: row } = await supabase.from('orders').select('is_rush').eq('id', order_id).single();
    return NextResponse.json({ success: true, data: { is_rush: Boolean(row?.is_rush) } });
  } catch (error: any) {
    console.error('[API /kitchen/rush] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
