import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  return {
    url,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_id, guest_count } = await req.json();
    if (!table_id) return NextResponse.json({ error: 'Table ID required' }, { status: 400 });

    const s = svc();

    // 1. Fetch table + linked reservation
    const tableRes = await fetch(`${s.url}/rest/v1/table_floors?select=*&id=eq.${table_id}`, { headers: s.headers });
    if (!tableRes.ok) return NextResponse.json({ error: 'Failed to fetch table' }, { status: 500 });
    const tables: any[] = await tableRes.json();
    const currentTable = tables?.[0];
    if (!currentTable) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

    if (currentTable.status !== 'reserved') {
      return NextResponse.json({ error: 'Table is not reserved' }, { status: 409 });
    }

    const reservationId = currentTable.reservation_id;
    if (!reservationId) {
      return NextResponse.json({ error: 'Table has no linked reservation' }, { status: 409 });
    }

    const reservationRes = await fetch(`${s.url}/rest/v1/reservations?id=eq.${reservationId}`, { headers: s.headers });
    if (!reservationRes.ok) return NextResponse.json({ error: 'Failed to fetch reservation' }, { status: 500 });
    const reservations: any[] = await reservationRes.json();
    const reservation = reservations?.[0];
    if (!reservation) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

    // 2. Find existing DRAFT order for this table (created by reserve-table)
    const draftRes = await fetch(
      `${s.url}/rest/v1/orders?select=*&table_number=eq.${currentTable.table_number}&is_draft=eq.true&kitchen_status=eq.reserved&status=neq.cancelled&status=neq.paid`,
      { headers: s.headers }
    );
    const draftOrders: any[] = await draftRes.json();

    let activeOrder: any;

    if (draftOrders.length > 0) {
      // 2a. Upgrade existing draft order → real active order
      const draft = draftOrders[0];
      const patchBody: Record<string, any> = {
        is_draft: false,
        kitchen_status: 'pending',
        status: 'confirmed',
        guest_count: guest_count || draft.guest_count || reservation.guests || 1,
        total_amount: Number(reservation.pre_order_total ?? draft.total_amount ?? 0),
        customer_note: reservation.note || draft.customer_note || 'Rezervasiya',
        reservation_id: reservationId,
      };

      const patchRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${draft.id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) {
        const errText = await patchRes.text();
        return NextResponse.json({ error: `Failed to activate draft order: ${errText}` }, { status: 500 });
      }
      const patched = await patchRes.json();
      activeOrder = Array.isArray(patched) ? patched[0] : patched;
    } else {
      // 2b. No draft found → create a fresh order (fallback)
      const orderPayload: Record<string, any> = {
        table_number: currentTable.table_number,
        reservation_id: reservationId,
        status: 'confirmed',
        order_type: 'dine_in',
        kitchen_status: 'pending',
        is_draft: false,
        guest_count: guest_count || reservation.guests || 1,
        total_amount: Number(reservation.pre_order_total || 0),
        customer_note: reservation.note || 'Rezervasiya',
        created_at: new Date().toISOString(),
        version: 1,
      };

      const createRes = await fetch(`${s.url}/rest/v1/orders`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify(orderPayload),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        return NextResponse.json({ error: `Order creation failed: ${errText}` }, { status: 500 });
      }
      const created = await createRes.json();
      activeOrder = Array.isArray(created) ? created[0] : created;

      // Transfer pre-order items if any
      const preItems = typeof reservation.pre_order_items === 'string'
        ? JSON.parse(reservation.pre_order_items)
        : (reservation.pre_order_items || []);

      if (Array.isArray(preItems) && preItems.length > 0) {
        const itemPromises = preItems.map((item: any) =>
          fetch(`${s.url}/rest/v1/order_items`, {
            method: 'POST',
            headers: s.headers,
            body: JSON.stringify({
              order_id: activeOrder.id,
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.unit_price * item.quantity,
              modifiers: JSON.stringify(item.modifiers || []),
              special_notes: item.special_notes || '',
              kitchen_status: 'pending',
            }),
          })
        );
        await Promise.all(itemPromises);
      }
    }

    if (!activeOrder?.id) {
      return NextResponse.json({ error: 'Failed to get active order' }, { status: 500 });
    }

    // 3. Update Reservation → checked_in
    await fetch(`${s.url}/rest/v1/reservations?id=eq.${reservationId}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
      }),
    });

    // 4. Update Table → occupied (clears reservation tie)
    const tablePatch: Record<string, any> = {
      status: 'occupied',
      reservation_id: null,
      reservation_name: null,
      reservation_phone: null,
      reservation_time: null,
      guest_count: guest_count || reservation.guests || currentTable.guest_count || null,
    };

    const updatedTableRes = await fetch(`${s.url}/rest/v1/table_floors?id=eq.${table_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify(tablePatch),
    });
    if (!updatedTableRes.ok) {
      return NextResponse.json({ error: 'Failed to update table' }, { status: 500 });
    }

    const updatedTables = await updatedTableRes.json();
    const updatedTable = Array.isArray(updatedTables) ? updatedTables[0] : updatedTables;

    return NextResponse.json({ success: true, table: updatedTable, order: activeOrder });
  } catch (error: any) {
    console.error('[API /tables/activate] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
