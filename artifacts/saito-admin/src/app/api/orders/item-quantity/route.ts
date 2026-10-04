import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// 13d: service-role bridge for the `update_order_item_quantity` RPC.
// ROOT CAUSE (audit 13d-A): the RPC is SECURITY INVOKER, and the browser
// client cannot see order_items rows (RLS `order_items_select_loc` depends on
// app.current_role / app.current_org_id, which the pooler does NOT set for
// user sessions). Called from the browser, the RPC's `SELECT ... INTO v_item`
// finds nothing and raises ORDER_ITEM_NOT_FOUND — so POS quantity edits,
// partial-cancel qty reductions and add-to-existing merges were silently
// failing (or erroring) from the client. Service-role invocation bypasses RLS,
// restoring the intended FOR UPDATE + SSOT total recompute.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('pos.use');
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { order_item_id, quantity, unit_price } = body;
    if (!order_item_id || quantity == null) {
      console.error('[API /orders/item-quantity] 400 validation — missing fields:', body);
      return NextResponse.json({ error: 'order_item_id and quantity are required' }, { status: 400 });
    }
    const qty = Number(quantity);
    const price = Number(unit_price);
    if (Number.isNaN(qty) || qty < 0) {
      console.error('[API /orders/item-quantity] 400 validation — bad quantity:', body);
      return NextResponse.json({ error: 'quantity must be >= 0' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    // Verify the item exists (fail fast with a real error instead of the RPC's generic one)
    const itemRes = await fetch(`${url}/rest/v1/order_items?select=id,order_id&limit=1&id=eq.${order_item_id}`, { headers });
    const items: any[] = itemRes.ok ? await itemRes.json() : [];
    if (items.length === 0) {
      return NextResponse.json({ error: 'ORDER_ITEM_NOT_FOUND' }, { status: 404 });
    }

    const rpcRes = await fetch(`${url}/rest/v1/rpc/update_order_item_quantity`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_order_item_id: order_item_id,
        p_quantity: qty,
        p_unit_price: Number.isNaN(price) ? 0 : price,
      }),
    });
    const data = await rpcRes.json().catch(() => ({}));
    if (!rpcRes.ok) {
      console.error('[API /orders/item-quantity] RPC failed:', rpcRes.status, data);
      return NextResponse.json(
        { error: data?.error || data?.message || `RPC failed (${rpcRes.status})` },
        { status: rpcRes.status >= 500 ? 500 : rpcRes.status }
      );
    }
    return NextResponse.json({ success: true, ...(typeof data === 'object' && data ? data : {}) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
