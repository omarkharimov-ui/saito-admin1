import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { shiftGate } from '@/lib/shiftLock';
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
    const body = await req.json().catch(() => ({}));

    const { action, order_item_id, reason, terminal_id, origin } = body;
    if (!action || !order_item_id) return NextResponse.json({ error: 'action and order_item_id required' }, { status: 400 });
    if (!['void', 'comp', 'waste'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    const g = await requireKdsAction({ order_item_id }, action === 'waste' ? 'kitchen.manage' : 'order.void');
    if (!g.ok) return g.res;

    // 12q (E2E r12q2 finding): KDS 86 is a KITCHEN-AVAILABILITY action, not a
    // register operation — a kitchen terminal must be able to 86 an out-of-
    // stock item even when the cash shift is closed (Toast/Square parity: 86
    // works from the KDS regardless of register state; the money correction
    // lands at checkout, and the permission gate above + state machine +
    // operation log still apply). POS comp/void/waste keep the shift gate
    // (register-session hygiene, PinGuard escalation) — only an explicit
    // KDS-origin 'void' is exempt.
    if (!(origin === 'kds' && action === 'void')) {
      const shiftCheck = await shiftGate(req, body);
      if (!shiftCheck.ok) return NextResponse.json({ error: shiftCheck.error, pin_required: !!shiftCheck.pin_required }, { status: 403 });
    }

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
