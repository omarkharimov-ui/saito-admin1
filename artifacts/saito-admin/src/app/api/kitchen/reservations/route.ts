import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// 13d: service-role feed for the kitchen "Gözlənilən Rezervlər" panel.
// ROOT CAUSE (audit 13d-A): UpcomingReservations polled `reservations`
// directly from the browser; RLS `reservations_select_loc` depends on
// app.current_role / org+location settings (not set for user sessions) →
// the panel was always empty and never rendered.
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('kitchen.view');
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const res = await fetch(
      `${url}/rest/v1/reservations?select=id,name,phone,guests,date,time,status,table_number,pre_order_items,pre_order_total` +
      `&status=eq.confirmed&date=gte.${todayStr}&order=date.asc,time.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to load reservations' }, { status: 502 });
    return NextResponse.json(await res.json());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
