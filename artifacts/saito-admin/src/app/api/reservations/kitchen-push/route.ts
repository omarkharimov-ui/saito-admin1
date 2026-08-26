import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
    if (authHeader !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = svc();
    const now = new Date().toISOString();

    const { data: schedules } = await supabase
      .from('kitchen_schedule')
      .select('*, reservations!inner(*)')
      .eq('status', 'pending')
      .lte('scheduled_at', now);

    if (!schedules?.length) {
      return NextResponse.json({ pushed: 0 });
    }

    let pushed = 0;
    for (const s of schedules) {
      const reservation = s.reservations;
      if (!reservation) continue;

      const { data: existingOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('reservation_id', reservation.id)
        .neq('status', 'cancelled')
        .limit(1);

      if (existingOrders?.length) {
        const order = existingOrders[0];
        await supabase.rpc('push_reservation_to_kitchen', {
          p_order_id: order.id,
          p_schedule_id: s.id,
        });
      }
      pushed++;
    }

    return NextResponse.json({ pushed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
