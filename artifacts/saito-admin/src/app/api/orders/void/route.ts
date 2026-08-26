import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * POST /api/orders/void
 * Void items — state-aware:
 *   DRAFT items → delete (no stock impact)
 *   SENT/PREPARING items → void (no stock — not consumed yet)
 *   READY/SERVED items → BLOCKED (must use waste/loss workflow)
 *
 * Body: {
 *   order_id: string,
 *   items: [{ order_item_id: string, quantity: number }],
 *   reason?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const supabase = await createAuthClient();
    const { order_id, items, reason } = await req.json();
    if (!order_id || !items?.length) {
      return NextResponse.json({ error: 'order_id and items required' }, { status: 400 });
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('void_items_state_aware', {
      p_order_id: order_id,
      p_items: items.map((i: any) => ({
        order_item_id: i.order_item_id,
        quantity: i.quantity,
      })),
      p_performed_by: auth.user?.id || null,
      p_reason: reason || null,
    });

    if (rpcErr) throw rpcErr;
    if (!rpcResult?.success) {
      return NextResponse.json(rpcResult, { status: 400 });
    }

    return NextResponse.json(rpcResult);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
