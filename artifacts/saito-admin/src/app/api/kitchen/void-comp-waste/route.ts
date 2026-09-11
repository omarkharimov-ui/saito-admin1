import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/kitchen/void-comp-waste
 * K-G3: canonical. Session identity + location scope + permission (requireKdsAction).
 *   void / comp → item_kitchen_terminal (idempotent + finalized guard + stock + SSOT + outbox)
 *   waste       → waste_order_item_atomic (quantity/ledger total semantics kept) — guarded.
 * Client performed_by NOT accepted.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) return NextResponse.json({ error: shiftCheck.error }, { status: 403 });

    const { action, order_item_id, reason, terminal_id } = await req.json();
    if (!action || !order_item_id) return NextResponse.json({ error: 'action and order_item_id required' }, { status: 400 });
    if (!['void', 'comp', 'waste'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    const g = await requireKdsAction({ order_item_id }, action === 'waste' ? 'kitchen.manage' : 'order.void');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    let data: any; let error: any;
    if (action === 'void' || action === 'comp') {
      const r = await supabase.rpc('item_kitchen_terminal', {
        p_token: g.token, p_item_id: order_item_id,
        p_action: action === 'void' ? 'voided' : 'comped',
        p_reason: reason || action, p_metadata: null, p_correlation_id: null,
      });
      data = r.data; error = r.error;
    } else {
      const r = await supabase.rpc('waste_order_item_atomic', {
        p_order_item_id: order_item_id, p_reason: reason || 'waste',
        p_performed_by: g.performed_by, p_performed_by_terminal_id: terminal_id || null,
      });
      data = r.data; error = r.error;
    }

    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      if (m.includes('ORDER_FINALIZED')) return NextResponse.json({ success: false, error: 'ORDER_FINALIZED' }, { status: 409 });
      if (m.includes('INVALID_ITEM_TRANSITION')) return NextResponse.json({ success: false, error: 'INVALID_ITEM_TRANSITION', detail: m }, { status: 422 });
      if (m.includes('MANAGER_OVERRIDE_REQUIRED')) return NextResponse.json({ success: false, error: 'MANAGER_OVERRIDE_REQUIRED' }, { status: 403 });
      return NextResponse.json({ error: m }, { status: 500 });
    }
    if (data && data.success === false) return NextResponse.json(data, { status: 400 });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /kitchen/void-comp-waste] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
