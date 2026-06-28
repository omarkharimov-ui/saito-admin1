import { NextResponse } from 'next/server';
import { groqChat, parseJsonFromText } from '@/lib/groq';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const res = await fetch(
      `${svc().url}/rest/v1/reservations?select=*&date=eq.${tomorrowStr}&status=eq.confirmed&not.pre_order_items=is.null`,
      { headers: svc().headers }
    );
    const reservations = await res.json();

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const nowTime = now.toTimeString().slice(0, 5);

    const todayRes = await fetch(
      `${svc().url}/rest/v1/reservations?select=*&date=eq.${today}&status=eq.confirmed&not.pre_order_items=is.null`,
      { headers: svc().headers }
    );
    const todayReservations = await todayRes.json();

    const upcomingToday = (todayReservations || []).filter((r: any) => {
      if (!r.time) return false;
      return r.time >= nowTime;
    });

    const allReservations = [
      ...(Array.isArray(reservations) ? reservations.map((r: any) => ({ ...r, type: 'tomorrow' })) : []),
      ...upcomingToday.map((r: any) => ({ ...r, type: 'today' }))
    ];

    const suggestions = [];

    for (const r of allReservations) {
      const items = typeof r.pre_order_items === 'string' ? JSON.parse(r.pre_order_items) : r.pre_order_items;
      const suggestion = await suggestPrepTime(r.time, items, r.kitchen_scheduled_at);
      suggestions.push({
        id: r.id,
        name: r.name,
        guests: r.guests,
        date: r.date,
        time: r.time,
        table_number: r.table_number,
        pre_order_items: items,
        pre_order_total: r.pre_order_total,
        type: r.type,
        suggestion: suggestion,
      });
    }

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { reservation_id, action } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    if (action === 'start_preparing') {
      const orderRes = await fetch(
        `${svc().url}/rest/v1/orders?select=id,table_number&reservation_id=eq.${reservation_id}&kitchen_status=eq.reserved`,
        { headers: svc().headers }
      );
      const orders = await orderRes.json();
      const order = Array.isArray(orders) ? orders[0] : null;

      if (order) {
        await fetch(`${svc().url}/rest/v1/orders?id=eq.${order.id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({
            kitchen_status: 'pending',
            kitchen_accepted_at: new Date().toISOString(),
          }),
        });

        await fetch(
          `${svc().url}/rest/v1/order_items?order_id=eq.${order.id}&kitchen_status=eq.reserved`,
          {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ kitchen_status: 'pending' }),
          }
        );

        await fetch(
          `${svc().url}/rest/v1/kitchen_schedule?reservation_id=eq.${reservation_id}`,
          {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ status: 'started' }),
          }
        );

        return NextResponse.json({
          success: true,
          order_id: order.id,
          table_number: order.table_number,
          message: `Masa ${order.table_number} sifarişi mətbəxə göndərildi`,
        });
      }
    }

    if (action === 'schedule') {
      const { scheduled_at } = body;
      await fetch(`${svc().url}/rest/v1/kitchen_schedule`, {
        method: 'POST',
        headers: svc().headers,
        body: JSON.stringify({
          reservation_id,
          table_number: body.table_number,
          scheduled_at,
          status: 'pending',
        }),
      });

      await fetch(`${svc().url}/rest/v1/reservations?id=eq.${reservation_id}`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify({ kitchen_scheduled_at: scheduled_at }),
      });

      return NextResponse.json({ success: true, scheduled_at });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function suggestPrepTime(time: string, preOrderItems: any, existingScheduledAt?: string): Promise<{ prepare_at: string; ready_by: string; minutes_before: number; item_count: number }> {
  const [hours, minutes] = time.split(':').map(Number);
  const reservationDate = new Date();
  reservationDate.setHours(hours, minutes, 0, 0);

  const items = typeof preOrderItems === 'string' ? JSON.parse(preOrderItems) : (preOrderItems || []);
  const itemCount = (items || []).reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

  let estimatedPrepMinutes = 30;

  if (existingScheduledAt) {
    const scheduledDate = new Date(existingScheduledAt);
    estimatedPrepMinutes = Math.round((reservationDate.getTime() - scheduledDate.getTime()) / 60000);
  } else if (items.length > 0) {
    try {
      const itemNames = items.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ');
      const systemPrompt = `Sən restoran mətbəx köməkçisisən. Bu yeməklərin hamısının eyni vaxtda hazır olması üçün hazırlığa nə qədər vaxt (dəqiqə ilə) qabaqcadan başlanılmalıdır? Yalnız JSON formatında cavab ver: {"minutes": number}`;
      const userPrompt = `Yeməklər: ${itemNames}`;
      const aiResponse = await groqChat(systemPrompt, userPrompt);
      const result = parseJsonFromText<{ minutes: number }>(aiResponse);
      estimatedPrepMinutes = result?.minutes || 30;
    } catch (e) {
      estimatedPrepMinutes = 30;
    }
  }

  const prepareAt = new Date(reservationDate.getTime() - estimatedPrepMinutes * 60 * 1000);

  return {
    prepare_at: prepareAt.toTimeString().slice(0, 5),
    ready_by: time,
    minutes_before: estimatedPrepMinutes,
    item_count: itemCount,
  };
}
