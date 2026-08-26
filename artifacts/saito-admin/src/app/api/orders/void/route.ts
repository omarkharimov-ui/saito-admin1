import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

/**
 * POST /api/orders/void
 * Void items — cashier mistake, item never left kitchen.
 * Uses void_payment_atomic RPC for atomic operation.
 *
 * Body: {
 *   order_id: string,
 *   items: [{ order_item_id: string, quantity: number }]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createAuthClient();
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { order_id, items } = await req.json();
    if (!order_id || !items?.length) {
      return NextResponse.json({ error: 'order_id and items required' }, { status: 400 });
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('void_payment_atomic', {
      p_order_id: order_id,
      p_items: items.map((i: any) => ({
        order_item_id: i.order_item_id,
        quantity: i.quantity,
      })),
      p_performed_by: auth.user?.id || null,
      p_performed_by_terminal_id: null,
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
