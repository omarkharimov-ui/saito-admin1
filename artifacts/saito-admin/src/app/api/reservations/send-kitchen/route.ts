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
    if (!auth.authenticated) return auth;

    const { reservation_id } = await request.json();
    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const s = svc();

    const ordersRes = await fetch(`${s.url}/rest/v1/orders?select=id&reservation_id=eq.${reservation_id}&is_draft=eq.true&kitchen_status=eq.reserved`, { headers: s.headers });
    const draftOrders = await ordersRes.json();

    if (!Array.isArray(draftOrders) || draftOrders.length === 0) {
      return NextResponse.json({ error: 'No draft order found for this reservation' }, { status: 404 });
    }

    const now = new Date().toISOString();
    for (const order of draftOrders) {
      await fetch(`${s.url}/rest/v1/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ kitchen_status: 'pending', kitchen_accepted_at: now, status: 'confirmed' }),
      });
      await fetch(`${s.url}/rest/v1/order_items?order_id=eq.${order.id}&kitchen_status=eq.reserved`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ kitchen_status: 'pending' }),
      });
    }

    return NextResponse.json({ success: true, sent: draftOrders.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
