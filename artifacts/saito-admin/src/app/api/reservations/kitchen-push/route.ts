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
        await supabase.from('orders').update({ kitchen_status: 'pending', kitchen_accepted_at: now }).eq('id', order.id);
        await supabase.from('order_items').update({ kitchen_status: 'pending' }).eq('order_id', order.id).eq('kitchen_status', 'reserved');
      }

      await supabase.from('kitchen_schedule').update({ status: 'started' }).eq('id', s.id);
      pushed++;
    }

    return NextResponse.json({ pushed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
