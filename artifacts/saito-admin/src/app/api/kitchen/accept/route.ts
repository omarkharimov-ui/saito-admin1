import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/kitchen/accept
 * 12i (owner): "metbex qəbul etməlidir → status hazırlanır".
 * Canonical order-level KDS ACCEPT → accept_kitchen_ticket_atomic
 * (order pending → accepted; table_floors mirrored; operation_logs).
 * Session identity + location scope + kitchen.manage. Client performed_by NOT accepted.
 */
export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();
    if (!order_id) return NextResponse.json({ error: 'order_id is required' }, { status: 400 });

    const g = await requireKdsAction({ order_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data, error } = await supabase.rpc('accept_kitchen_ticket_atomic', {
      p_order_id: order_id,
      p_performed_by: g.performed_by,
      p_performed_by_terminal_id: null,
    });

    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      return NextResponse.json({ error: m }, { status: 500 });
    }
    if (!data?.success) return NextResponse.json(data || { error: 'ACCEPT_FAILED' }, { status: 409 });
    // 12p: the RPC does NOT stamp the accept time — write it here (when
    // still NULL) so GÜN Ø QƏBUL + the legacy kitchen timer base stay
    // truthful now that KDS auto-accept is the only accept path.
    await supabase
      .from('orders')
      .update({ kitchen_accepted_at: new Date().toISOString() })
      .eq('id', order_id)
      .is('kitchen_accepted_at', null);
    // 12q (owner: "hazırdır basıram, sonra status evvelkisinə qaydır"): the
    // RPC sets the ORDER to 'accepted' but leaves the items 'pending' — and
    // the frozen rollup (trg_sync_order_kitchen_status) computes the order
    // status from ITEMS ALONE, so ANY later item update (even a
    // prepared_quantity tick, 12o) demoted the order back to 'pending'
    // (GÖZLƏYİR). Align the items to the REGISTERED item edge
    // pending/sent → accepted (state_transitions, kitchen.manage — verified
    // in the real DB: guard passes, rollup then keeps 'accepted' across
    // ticks, and mark_item_ready_atomic accepts 'accepted' items):
    await supabase
      .from('order_items')
      .update({ kitchen_status: 'accepted' })
      .eq('order_id', order_id)
      .in('kitchen_status', ['pending', 'sent']);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /kitchen/accept] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
