import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/orders/waste
 * Record item waste — state-aware:
 *   READY/SERVED items → waste (stock already consumed at READY)
 *   DRAFT/SENT/PREPARING items → BLOCKED (use void instead)
 *
 * Body: {
 *   order_item_id: string,
 *   quantity?: number,    // null = full quantity
 *   reason: string,       // 'customer_return', 'kitchen_error', 'spoilage', 'spillage', 'other'
 *   reason_text?: string  // free text
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { order_item_id, quantity, reason, reason_text } = await req.json();

    if (!order_item_id || !reason) {
      return NextResponse.json({ error: 'order_item_id and reason required' }, { status: 400 });
    }

    // K-G3: session identity + location scope + kitchen.manage (kitchen waste model)
    const g = await requireKdsAction({ order_item_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('record_item_waste', {
      p_order_item_id: order_item_id,
      p_quantity: quantity || null,
      p_reason: reason,
      p_reason_text: reason_text || null,
      p_performed_by: g.performed_by,
    });

    if (rpcErr) {
      const m = String(rpcErr.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED' }, { status: 403 });
      throw rpcErr;
    }
    if (!rpcResult?.success) {
      return NextResponse.json(rpcResult, { status: 400 });
    }

    return NextResponse.json(rpcResult);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
