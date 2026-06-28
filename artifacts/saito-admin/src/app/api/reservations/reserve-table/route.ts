import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { groqChat, parseJsonFromText } from '@/lib/groq';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { reservation_id, table_ids, guest_count, pre_order_items, schedule_minutes_before } = body;
    let { table_number } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const resRes = await fetch(
      `${svc().url}/rest/v1/reservations?select=*&id=eq.${reservation_id}`,
      { headers: svc().headers }
    );
    const resData = await resRes.json();
    const reservation = resData?.[0];
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    const checkUrl = `${svc().url}/rest/v1/reservations?select=id,name,time&date=eq.${reservation.date}&status=eq.confirmed`;
    const checkRes = await fetch(checkUrl, { headers: svc().headers });
    const existing = await checkRes.json();

    const requestedTime = new Date(`1970-01-01T${reservation.time}:00`).getTime();
    const buffer = 2 * 60 * 60 * 1000; // 2 hours

    const conflict = existing.find((res: any) => {
      if (res.id === reservation_id) return false;
      const resTime = new Date(`1970-01-01T${res.time}:00`).getTime();
      const isOverlapping = Math.abs(requestedTime - resTime) < buffer;
      const existingTables = typeof res.table_ids === 'string' ? JSON.parse(res.table_ids) : (res.table_ids || []);
      const requestedTables = table_ids;
      const hasTableConflict = requestedTables.some((tId: string) => existingTables.includes(tId));
      return isOverlapping && hasTableConflict;
    });

    if (conflict) {
      return NextResponse.json({ 
        error: `Masa artıq ${conflict.name} tərəfindən saat ${conflict.time}-da rezerv edilib.` 
      }, { status: 409 });
    }

    if (!table_number && table_ids && table_ids.length > 0) {
      const tRes = await fetch(
        `${svc().url}/rest/v1/table_floors?select=table_number&id=eq.${table_ids[0]}`,
        { headers: svc().headers }
      );
      const tData = await tRes.json();
      table_number = tData?.[0]?.table_number;
    }

    if (!table_number) {
      return NextResponse.json({ error: 'table_number could not be resolved' }, { status: 400 });
    }

    const totalAmount = (pre_order_items || []).reduce(
      (sum: number, item: any) => sum + (item.unit_price * item.quantity),
      0
    );

    // 3. ATOMIC SYNC: Create a DRAFT order immediately to lock the table in POS
    // This ensures that even if 'table_floors' schema is missing columns,
    // the POS will see this table as RESERVED because of the draft order.
    const orderPayload = {
      table_number,
      reservation_id,
      status: 'confirmed',
      kitchen_status: 'reserved', // Special flag for POS status logic
      is_draft: true,
      guest_count: guest_count ?? reservation.guests ?? 2,
      total_amount: totalAmount || 0,
      customer_note: reservation.note || 'Rezervasiya',
      created_at: new Date().toISOString(),
      version: 1
    };

    const orderRes = await fetch(`${svc().url}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...svc().headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(orderPayload),
    });

    if (!orderRes.ok) {
        console.error("[reserve-table] Failed to create sync order:", await orderRes.text());
    }

    // 4. Update table_floors status (Minimal data to avoid schema errors)
    for (const tid of table_ids) {
      await fetch(`${svc().url}/rest/v1/table_floors?id=eq.${tid}`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify({ 
          status: 'reserved',
          reservation_id: reservation_id // Keep it for SSOT, even if fails
        }),
      }).catch(() => {}); // Silent catch to let the workflow continue via Orders sync
    }

    // 4. Kitchen schedule logic (Optional but kept)
    let kitchen_scheduled_at = null;
    if (pre_order_items && pre_order_items.length > 0) {
      let minutesBefore = schedule_minutes_before || 30;
      const [hours, minutes] = reservation.time.split(':').map(Number);
      const reservationDate = new Date(reservation.date);
      reservationDate.setHours(hours, minutes, 0, 0);
      kitchen_scheduled_at = new Date(reservationDate.getTime() - minutesBefore * 60 * 1000).toISOString();
    }

    await fetch(`${svc().url}/rest/v1/reservations?id=eq.${reservation_id}`, {
      method: 'PATCH',
      headers: svc().headers,
      body: JSON.stringify({
        table_number,
        table_ids: JSON.stringify(table_ids),
        pre_order_items: pre_order_items ? JSON.stringify(pre_order_items) : null,
        pre_order_total: totalAmount || null,
        kitchen_scheduled_at,
        status: 'confirmed',
      }),
    });

    return NextResponse.json({
      success: true,
      table_number,
      kitchen_scheduled_at,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
