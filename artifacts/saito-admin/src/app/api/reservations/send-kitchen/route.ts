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
    const draftOrder = Array.isArray(draftOrders) && draftOrders.length > 0 ? draftOrders[0] : null;

    let orderId: string;
    if (draftOrder) {
      orderId = draftOrder.id;
    } else {
      // No draft exists (reservation confirmed without a table, or pre-orders
      // were added after confirmation). Build the order from the single source
      // of truth: reservation_preorder_items.
      const resRes = await fetch(
        `${s.url}/rest/v1/reservations?select=*&id=eq.${reservation_id}`,
        { headers: s.headers }
      );
      const resData = await resRes.json();
      const reservation = resData?.[0];
      if (!reservation) {
        return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
      }

      const preRes = await fetch(
        `${s.url}/rest/v1/reservation_preorder_items?select=*&reservation_id=eq.${reservation_id}`,
        { headers: s.headers }
      );
      const preRows: any[] = await preRes.json();
      const items: any[] = Array.isArray(preRows) ? preRows : [];

      const table_number = reservation.table_number || '0';
      const totalAmount = items.reduce(
        (sum: number, item: any) => sum + (Number(item.unit_price || 0) * Number(item.quantity || 0)),
        0
      );

      const orderRes = await fetch(`${s.url}/rest/v1/orders`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          table_number,
          reservation_id,
          status: 'confirmed',
          kitchen_status: 'reserved',
          is_draft: true,
          guest_count: reservation.guests ?? 2,
          total_amount: totalAmount || 0,
          customer_id: reservation.customer_id || null,
          customer_name: reservation.name || reservation.customer_name || null,
          customer_note: reservation.note || 'Rezervasiya',
          created_at: new Date().toISOString(),
          version: 1,
        }),
      });
      if (!orderRes.ok) {
        console.error('[send-kitchen] Failed to create sync order:', await orderRes.text());
        throw new Error('Failed to create reservation order');
      }
      const orderData = await orderRes.json();
      const createdOrder = Array.isArray(orderData) ? orderData[0] : orderData;
      orderId = createdOrder.id;

      for (const item of items) {
        await fetch(`${s.url}/rest/v1/order_items`, {
          method: 'POST',
          headers: s.headers,
          body: JSON.stringify({
            order_id: orderId,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: Number(item.unit_price || 0) * Number(item.quantity || 0),
            modifiers: item.modifiers || [],
            special_notes: item.special_notes || '',
            kitchen_status: 'reserved',
          }),
        });
      }
    }

    const now = new Date().toISOString();
    await fetch(`${s.url}/rest/v1/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ kitchen_status: 'pending', kitchen_accepted_at: now, status: 'confirmed', is_draft: false }),
    });
    await fetch(`${s.url}/rest/v1/order_items?order_id=eq.${orderId}&kitchen_status=eq.reserved`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ kitchen_status: 'pending' }),
    });

    return NextResponse.json({ success: true, sent: 1 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
