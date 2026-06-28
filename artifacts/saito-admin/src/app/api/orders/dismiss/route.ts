import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) return NextResponse.json({ error: 'Table number required' }, { status: 400 });

    const s = svc();

    const ordersRes = await fetch(`${s.url}/rest/v1/orders?select=id,reservation_id,total_amount,order_items(*)&table_number=eq.${table_number}&status=neq.paid&status=neq.cancelled`, { headers: s.headers });
    if (!ordersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
    const orders: any[] = await ordersRes.json();

    if (Array.isArray(orders) && orders.length > 0) {
      const orderIds = orders.map((o: any) => o.id);
      const cancelRes = await fetch(`${s.url}/rest/v1/orders?id=in.(${orderIds.join(',')})`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        }),
      });
      if (!cancelRes.ok) {
        return NextResponse.json({ error: 'Failed to cancel orders' }, { status: 500 });
      }

      // Record in cancelled_orders for stats/audit
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

    // Get current table state before clearing
    const floorRes = await fetch(`${s.url}/rest/v1/table_floors?select=*&table_number=eq.${table_number}`, { headers: s.headers });
    const floorData = floorRes.ok ? await floorRes.json() : [];
    const currentFloor = floorData?.[0];

    const tablePatch: Record<string, any> = {
      status: 'empty',
      reservation_id: null,
      reservation_name: null,
      reservation_phone: null,
      reservation_time: null,
      guest_count: null,
      merged_into_table: null
    };

    // Find reservation_id: from table_floors (if not activated yet) or from active orders
    const orderResIds = Array.isArray(orders) ? orders.filter((o: any) => o.reservation_id).map((o: any) => o.reservation_id) : [];
    const resId = currentFloor?.reservation_id || orderResIds[0];

    // If table had a reservation, mark it cancelled/no_show
    if (resId) {
      // If there were orders, guest checked in but left → 'cancelled'
      // If no orders, guest never arrived → 'no_show'
      const hasOrders = Array.isArray(orders) && orders.length > 0;
      await fetch(`${s.url}/rest/v1/reservations?id=eq.${resId}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: hasOrders ? 'cancelled' : 'no_show',
        }),
      }).catch(() => {});
    }

    const tableRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify(tablePatch),
    });
    if (!tableRes.ok) {
      return NextResponse.json({ error: 'Failed to update table' }, { status: 500 });
    }

    return NextResponse.json({ success: true, table_number, status: 'empty' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

