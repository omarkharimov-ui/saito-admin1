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

    const { reservation_id, table_number } = await req.json();
    if (!reservation_id || !table_number) {
      return NextResponse.json({ error: 'reservation_id and table_number required' }, { status: 400 });
    }

    const s = svc();

    const result = await executeTransactionalOrderAction('ReservationActivate', async () => {
      // 1. Get reservation details
      const resRes = await fetch(`${s.url}/rest/v1/reservations?id=eq.${reservation_id}&select=*`, { headers: s.headers });
      const reservation = (await resRes.json())?.[0];
      if (!reservation) throw new Error('Reservation not found');

      // 2. Create the POS Order
      const orderPayload = {
        table_number,
        reservation_id,
        status: 'confirmed',
        order_type: 'dine_in',
        guest_count: reservation.guests || 1,
        total_amount: Number(reservation.pre_order_total || 0),
        customer_note: reservation.note,
        created_at: new Date().toISOString(),
        version: 1
      };

      const orderCreateRes = await fetch(`${s.url}/rest/v1/orders`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(orderPayload),
      });
      if (!orderCreateRes.ok) throw new Error('Order creation failed');
      const newOrder = (await orderCreateRes.json())?.[0];

      // 3. Transfer pre-order items if any
      const preItems = typeof reservation.pre_order_items === 'string' 
        ? JSON.parse(reservation.pre_order_items) 
        : (reservation.pre_order_items || []);

      if (Array.isArray(preItems) && preItems.length > 0) {
        for (const item of preItems) {
          await fetch(`${s.url}/rest/v1/order_items`, {
            method: 'POST',
            headers: s.headers,
            body: JSON.stringify({
              order_id: newOrder.id,
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.unit_price * item.quantity,
              modifiers: JSON.stringify(item.modifiers || []),
              special_notes: item.special_notes || '',
              kitchen_status: 'pending'
            }),
          });
        }
      }

      // 4. Update Reservation status
      await fetch(`${s.url}/rest/v1/reservations?id=eq.${reservation_id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
        }),
      });

      // 5. Update Table status
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'occupied',
          reservation_id: null, // Clear from table_floors as it's now an active session
          reservation_name: null,
          reservation_phone: null,
          reservation_time: null,
          guest_count: reservation.guests
        }),
      });

      return { success: true, order_id: newOrder.id };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /reservations/activate] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
