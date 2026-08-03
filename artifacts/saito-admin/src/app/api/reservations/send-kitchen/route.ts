import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) {
      return auth;
    }

    const { reservation_id, terminal_id } = await request.json();
    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const s = svc();

    const ordersRes = await fetch(`${s.url}/rest/v1/orders?select=id&reservation_id=eq.${reservation_id}&is_draft=eq.true&kitchen_status=eq.reserved`, { headers: s.headers });
    const draftOrders = await ordersRes.json();

    if (!Array.isArray(draftOrders) || draftOrders.length === 0) {
      return NextResponse.json({ error: 'No draft order found for this reservation' }, { status: 404 });
    }

    const results = [];
    for (const order of draftOrders) {
      const rpcRes = await fetch(`${s.url}/rest/v1/rpc/send_to_kitchen_atomic`, {
        method: 'POST',
        headers: s.headers,
      body: JSON.stringify({
        p_order_id: order.id,
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: terminal_id || null,
      }),
      });

      if (rpcRes.ok) {
        results.push({ orderId: order.id, sent: true });
      }
    }

    return NextResponse.json({ success: true, sent: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
