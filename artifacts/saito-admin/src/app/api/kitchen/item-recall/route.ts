import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/kitchen/item-recall
 * 12i (owner): "tik işləmir — tik etmək olur lakin tiki çıxarmaq olmaz".
 * Per-item UN-TICK → item_kitchen_terminal('recalled') = registry recall
 * semantics (ready → pending, kitchen.manage, no manager override — edge
 * verified in state_transitions). Idempotent (already pending = noop).
 * Only a READY item can be un-ticked; served items stay (served → pending
 * exists in the registry but the KDS UI never offers it).
 * Session identity + location scope + kitchen.manage.
 */
export async function POST(req: NextRequest) {
  try {
    const { order_item_id, reason } = await req.json();
    if (!order_item_id) return NextResponse.json({ error: 'order_item_id is required' }, { status: 400 });

    const g = await requireKdsAction({ order_item_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data, error } = await supabase.rpc('item_kitchen_terminal', {
      p_token: g.token, p_item_id: order_item_id, p_action: 'recalled',
      p_reason: reason || 'kds_uncheck', p_metadata: null, p_correlation_id: null,
    });

    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      if (m.includes('ORDER_FINALIZED')) return NextResponse.json({ success: false, error: 'ORDER_FINALIZED' }, { status: 409 });
      if (m.includes('INVALID_ITEM_TRANSITION')) return NextResponse.json({ success: false, error: 'INVALID_ITEM_TRANSITION', detail: m }, { status: 422 });
      return NextResponse.json({ error: m }, { status: 500 });
    }
    if (data && data.success === false) return NextResponse.json(data, { status: 400 });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /kitchen/item-recall] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
