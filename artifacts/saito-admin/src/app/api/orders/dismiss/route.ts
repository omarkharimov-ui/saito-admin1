import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  if (!url || !key) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration. Please create .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    );
  }
  
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const s = svc();
    if ('error' in s) return s; // svc() returned error response

    // 1. Fetch active orders for this table
    const ordersRes = await fetch(
      `${s.url}/rest/v1/orders?select=id,status,total_amount,reservation_id,guest_count&table_number=eq.${table_number}`,
      { headers: s.headers }
    );
    if (!ordersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
    const allOrders: any[] = await ordersRes.json();
    const orders = allOrders.filter((o: any) => o.status !== 'paid' && o.status !== 'cancelled');

    // 2. Cancel active orders
    if (orders.length > 0) {
      const orderIds = orders.map((o: any) => o.id);
      const resIdFromOrder = orders.find((o: any) => o.reservation_id)?.reservation_id || null;

      // Cancel orders
      const idOr = orderIds.map((id: string) => `id.eq.${id}`).join(',');
      const cancelRes = await fetch(`${s.url}/rest/v1/orders?or=(${idOr})`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
      });
      if (!cancelRes.ok) {
        return NextResponse.json({ error: 'Failed to cancel orders' }, { status: 500 });
      }

      // Cancel order items
      const itemIdOr = orderIds.map((id: string) => `order_id.eq.${id}`).join(',');
      const itemsRes = await fetch(`${s.url}/rest/v1/order_items?or=(${itemIdOr})`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ kitchen_status: 'cancelled' }),
      });
      if (!itemsRes.ok) {
        return NextResponse.json({ error: 'Failed to cancel items' }, { status: 500 });
      }

      // Audit log
      for (const order of orders) {
        await fetch(`${s.url}/rest/v1/cancelled_orders`, {
          method: 'POST',
          headers: s.headers,
          body: JSON.stringify({
            order_id: order.id,
            table_number,
            total_amount: Number(order.total_amount || 0),
            reason: 'dismiss',
            reason_text: 'Masa boşaldıldı',
            items: [],
            created_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }

      // Update reservation if linked
      const resId = resIdFromOrder;
      if (resId) {
        await fetch(`${s.url}/rest/v1/reservations?id=eq.${resId}`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ status: 'no_show' }),
        }).catch(() => {});
      }
    }

    // 3. Reset table to empty
    const patchRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'empty',
        reservation_id: null,
        reservation_name: null,
        reservation_phone: null,
        reservation_time: null,
        guest_count: null,
        merged_into_table: null,
      }),
    });
    if (!patchRes.ok) {
      return NextResponse.json({ error: 'Failed to reset table' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
