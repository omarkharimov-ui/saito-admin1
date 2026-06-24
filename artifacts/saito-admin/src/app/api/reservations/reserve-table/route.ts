import { NextResponse } from 'next/server';
import { groqChat, parseJsonFromText } from '@/lib/groq';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reservation_id, table_ids, guest_count, pre_order_items, schedule_minutes_before } = body;
    let { table_number } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    // 0. Rezervasiya məlumatlarını çək (name, time, date, guests)
    const resRes = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?select=id,name,time,date,guests&id=eq.${reservation_id}`,
      { headers }
    );
    const resData = await resRes.json();
    const reservation = resData?.[0];
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // table_number verilmeyibse, table_ids-den birinci masanin table_number-ini al
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

    // 1. table_floors-u update et — reservation_name, reservation_time, reservation_id dahil
    const tableFloorPatch = {
      status: 'reserved',
      reservation_id,
      reservation_name: reservation.name,
      reservation_time: reservation.time,
      guest_count: guest_count ?? reservation.guests ?? null,
    };

    if (table_ids && table_ids.length > 0) {
      // UUID id-ləri ilə update
      for (const tid of table_ids) {
        await fetch(`${SUPABASE_URL}/rest/v1/table_floors?id=eq.${tid}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(tableFloorPatch),
        });
      }
    } else {
      // table_number ilə update
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${table_number}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(tableFloorPatch),
      });
    }

    // 2. Kitchen schedule hesabla (pre-order varsa)
    let kitchen_scheduled_at = null;
    if (pre_order_items && pre_order_items.length > 0) {
      let minutesBefore = schedule_minutes_before;
      
      if (!minutesBefore) {
        // AI-dan hazırlıq vaxtı təxminini al
        try {
          const itemNames = pre_order_items.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ');
          const systemPrompt = `Restoran mətbəx köməkçisisən. Bu yeməklərin hamısının eyni vaxtda hazır olması üçün hazırlığa nə qədər vaxt (dəqiqə ilə) qabaqcadan başlanılmalıdır? Yalnız JSON: {"minutes": number}`;
          const userPrompt = `Yeməklər: ${itemNames}`;
          const aiResponse = await groqChat(systemPrompt, userPrompt);
          const result = parseJsonFromText<{ minutes: number }>(aiResponse);
          minutesBefore = result?.minutes || 30;
        } catch (e) {
          minutesBefore = 30;
        }
      }

      if (reservation.date && reservation.time) {
        const [hours, minutes] = reservation.time.split(':').map(Number);
        const reservationDate = new Date(reservation.date);
        reservationDate.setHours(hours, minutes, 0, 0);
        kitchen_scheduled_at = new Date(
          reservationDate.getTime() - minutesBefore * 60 * 1000
        ).toISOString();
      }
    }

    // 3. Rezervasiyanı update et
    await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${reservation_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        table_number,
        table_ids: table_ids ? JSON.stringify(table_ids) : JSON.stringify([table_number]),
        pre_order_items: pre_order_items ? JSON.stringify(pre_order_items) : null,
        pre_order_total: totalAmount || null,
        kitchen_scheduled_at,
        status: 'confirmed',
      }),
    });

    // 4. Pre-order varsa order yarat
    if (pre_order_items && pre_order_items.length > 0) {
      const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          table_number,
          total_amount: totalAmount,
          status: 'new',
          kitchen_status: 'reserved',
          order_type: 'dine_in',
          guest_count: guest_count ?? reservation.guests ?? null,
          customer_note: 'Öncədən sifariş (rezerv)',
          source: 'reservation',
          reservation_id,
          created_at: new Date().toISOString(),
        }),
      });
      const orderData = await orderRes.json();
      const orderId = Array.isArray(orderData) ? orderData[0]?.id : orderData?.id;

      if (orderId) {
        for (const item of pre_order_items) {
          await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              order_id: orderId,
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.unit_price * item.quantity,
              modifiers: item.modifiers ? JSON.stringify(item.modifiers) : null,
              special_notes: item.special_notes || null,
              kitchen_status: 'reserved',
            }),
          });
        }
      }

      if (kitchen_scheduled_at) {
        await fetch(`${SUPABASE_URL}/rest/v1/kitchen_schedule`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            reservation_id,
            table_number,
            order_id: orderId || null,
            scheduled_at: kitchen_scheduled_at,
            guest_count: guest_count ?? reservation.guests ?? null,
            status: 'pending',
          }),
        });
      }
    }

    return NextResponse.json({
      success: true,
      table_number,
      kitchen_scheduled_at,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
