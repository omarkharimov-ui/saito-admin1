import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/kitchen/recall
 * K-G3: canonical order-level KDS recall → kitchen_order_items_action('recall').
 * Sends each active item back to 'pending' (registry recall semantics).
 * Session identity + location scope + kitchen.manage. Client performed_by NOT accepted.
 */
export async function POST(req: NextRequest) {
  try {
    const { order_id, reason } = await req.json();
    if (!order_id) return NextResponse.json({ error: 'order_id is required' }, { status: 400 });

    const g = await requireKdsAction({ order_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data, error } = await supabase.rpc('kitchen_order_items_action', {
      p_token: g.token, p_order_id: order_id, p_action: 'recall',
      p_reason: reason || 'kitchen_recall', p_correlation_id: null,
    });

    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      if (m.includes('ORDER_NOT_FOUND')) return NextResponse.json({ success: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });
      return NextResponse.json({ error: m }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /kitchen/recall] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
