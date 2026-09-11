import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/orders/mark-ready
 * K-G3: session identity + location scope + kitchen.manage (requireKdsAction).
 * mark_item_ready_atomic is order-level (marks a set of items ready at once) —
 * its stock/total semantics are preserved; performed_by = session staffId.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { order_id, item_ids } = await request.json();
    if (!order_id) return NextResponse.json({ error: 'order_id is required' }, { status: 400 });

    const g = await requireKdsAction({ order_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('mark_item_ready_atomic', {
      p_order_id: order_id,
      p_item_ids: item_ids || null,
      p_performed_by: g.performed_by,
    });

    if (rpcErr) {
      const m = String(rpcErr.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED' }, { status: 403 });
      if (m.includes('ORDER_FINALIZED')) return NextResponse.json({ success: false, error: 'ORDER_FINALIZED' }, { status: 409 });
      throw rpcErr;
    }
    if (!rpcResult?.success) return NextResponse.json(rpcResult, { status: 400 });
    return NextResponse.json(rpcResult);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
