import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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
      // 1. Find active (non-paid) orders for this table
      const ordersRes = await fetch(`${s.url}/rest/v1/orders?select=id,reservation_id,total_amount,order_items(*)&table_number=eq.${table_number}&status=neq.paid&status=neq.cancelled`, { headers: s.headers });
      const orders: any[] = await ordersRes.json();

      let resIdFromOrder = null;

      if (Array.isArray(orders) && orders.length > 0) {
        const orderIds = orders.map((o: any) => o.id);
        resIdFromOrder = orders.find(o => o.reservation_id)?.reservation_id;

        // 2. Cancel the orders
        await fetch(`${s.url}/rest/v1/orders?id=in.(${orderIds.join(',')})`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ 
            status: 'cancelled',
            cancelled_at: new Date().toISOString()
          }),
        });

        // 3. Cancel all kitchen items associated with these orders
        await fetch(`${s.url}/rest/v1/order_items?order_id=in.(${orderIds.join(',')})`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ 
            kitchen_status: 'cancelled' 
          }),
        });

        // 4. Record in cancelled_orders for audit
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
              items: (order.order_items || []).map((i: any) => ({
                name: i.product_name || i.product_id,
                quantity: i.quantity,
                price: i.unit_price,
              })),
              created_at: new Date().toISOString(),
            }),
          }).catch(() => {});
        }
      }

      // 5. Get current table floor state
      const floorRes = await fetch(`${s.url}/rest/v1/table_floors?select=*&table_number=eq.${table_number}`, { headers: s.headers });
      const currentFloor = (await floorRes.json())?.[0];

      const resId = currentFloor?.reservation_id || resIdFromOrder;

      // 6. Handle Reservation cleanup
      if (resId) {
        const hasOrders = Array.isArray(orders) && orders.length > 0;
        await fetch(`${s.url}/rest/v1/reservations?id=eq.${resId}`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({
            status: hasOrders ? 'cancelled' : 'no_show',
          }),
        }).catch(() => {});
      }

      // 7. Reset Table status
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'empty',
          reservation_id: null,
          reservation_name: null,
          reservation_phone: null,
          reservation_time: null,
          guest_count: null,
          merged_into_table: null
        }),
      });

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
