import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) return NextResponse.json({ error: 'Table number required' }, { status: 400 });

    const s = svc();

    const result = await executeTransactionalOrderAction('TableDismiss', async () => {
      const s = svc();

      // 1. Find active orders for this table (simple query, no joins)
      const ordersRes = await fetch(`${s.url}/rest/v1/orders?select=id,table_number,status,reservation_id,total_amount,guest_count&table_number=eq.${table_number}`, { headers: s.headers });
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const allOrders: any[] = await ordersRes.json();
      const orders = allOrders.filter(o => o.status !== 'paid' && o.status !== 'cancelled');

      let resIdFromOrder: string | null = null;

      if (orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        resIdFromOrder = orders.find(o => o.reservation_id)?.reservation_id || null;

        const idOr = orderIds.map(id => `id.eq.${id}`).join(',');

        // 2. Cancel the orders
        const cancelRes = await fetch(`${s.url}/rest/v1/orders?or=(${idOr})`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
        });
        if (!cancelRes.ok) throw new Error('Failed to cancel orders');

        // 3. Cancel order items
        const itemIdOr = orderIds.map(id => `order_id.eq.${id}`).join(',');
        const itemsRes = await fetch(`${s.url}/rest/v1/order_items?or=(${itemIdOr})`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ kitchen_status: 'cancelled' }),
        });
        if (!itemsRes.ok) throw new Error('Failed to cancel items');

        // 4. Audit log
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
      }

      // 5. Reset table
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
      if (!patchRes.ok) throw new Error('Failed to reset table');

      return { success: true };
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Dismiss failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
