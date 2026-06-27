import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { groqChat, parseJsonFromText } from '@/lib/groq';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

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
      `${SUPABASE_URL}/rest/v1/reservations?select=*&id=eq.${reservation_id}`,
      { headers }
    );
    const resData = await resRes.json();
    const reservation = resData?.[0];
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    const checkUrl = `${SUPABASE_URL}/rest/v1/reservations?select=id,name,time&date=eq.${reservation.date}&status=eq.confirmed`;
    const checkRes = await fetch(checkUrl, { headers });
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
        `${SUPABASE_URL}/rest/v1/table_floors?select=table_number&id=eq.${table_ids[0]}`,
        { headers }
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

    const tableFloorPatch = {
      status: 'reserved',
      reservation_id,
      reservation_name: reservation.customer_name || reservation.name || 'Guest',
      reservation_phone: reservation.phone,
      reservation_time: reservation.time,
      guest_count: guest_count ?? reservation.guests ?? null,
    };

    for (const tid of table_ids) {
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?id=eq.${tid}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(tableFloorPatch),
      });
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

    await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${reservation_id}`, {
      method: 'PATCH',
      headers,
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
