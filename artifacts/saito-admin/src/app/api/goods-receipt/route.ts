import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createTransactionLog } from '@/lib/transaction';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * POST /api/goods-receipt — Goods Receipt Note for a purchase order.
 * Body: { purchaseOrderId: string, items: [{ id: string, received_quantity: number }] }
 *
 * Delta semantics: `received_quantity` is the NEW cumulative total per PO
 * item. Only the delta over the previously recorded received_quantity is
 * stocked (re-submitting the same totals is a no-op; partial receives
 * accumulate).
 *
 * 11g (freeze audit, CRITICAL): the whole receive runs as ONE server-side
 * transaction — `receive_purchase_order(p_po_id, p_items)`. The 11b version
 * ran 3 supabase-js steps through `withTransaction`, but supabase-js returns
 * `{error}` instead of throwing → NO step failure was ever detected →
 * rollback was dead code and the route answered 200 success:true even when
 * the stock_in/mark_received/PO-status writes silently failed. In the RPC:
 * FOR UPDATE row lock (concurrent receives serialize), inventory_logs
 * stock_in triggers (WAC, stock, availability) fire inside the same
 * transaction, and any failure rolls the WHOLE receive back atomically.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { purchaseOrderId, items } = await request.json();
    if (!purchaseOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'purchaseOrderId and items[] are required' }, { status: 400 });
    }

    const supabase = svc();
    const { data, error } = await supabase.rpc('receive_purchase_order', {
      p_po_id: purchaseOrderId,
      p_items: items,
    });

    if (error) {
      // The RPC raises stable markers; map them to proper HTTP codes.
      if (error.message.includes('PO_NOT_FOUND')) {
        return NextResponse.json({ error: 'PO not found' }, { status: 404 });
      }
      const m = error.message.match(/^PO_(\w+)_CANNOT_RECEIVE/);
      if (m) return NextResponse.json({ error: `PO is ${m[1]} — cannot receive` }, { status: 409 });
      await createTransactionLog('goods_receipt', 'failed', error.message).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await createTransactionLog('goods_receipt', 'completed', JSON.stringify(data)).catch(() => {});
    return NextResponse.json(data);
  } catch (e: any) {
    await createTransactionLog('goods_receipt', 'failed', e.message).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
