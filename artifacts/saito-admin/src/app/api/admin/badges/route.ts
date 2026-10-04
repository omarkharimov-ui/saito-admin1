import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13d: service-role badge counts for NotificationContext (all admin pages).
// ROOT CAUSE (audit 13d-A): the context polled `orders` (new / kitchen-ready)
// and `reservations` (pending, tomorrow) + a 5-min overdue-orders sweep
// directly from the browser — all RLS-gated (app.current_role not set for
// user sessions) → the navbar bell was permanently 0, the "yeni rezervasiya"
// sound never fired, and the overdue-order warning never ran (silently).
// `delay_minutes` comes from the client (which already reads it from settings
// via the whitelisted endpoint) so this route stays settings-agnostic.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
    };

    const { searchParams } = new URL(request.url);
    const delayMinutes = Math.max(1, Number(searchParams.get('delay_minutes') || '20') || 20);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const overdueCutoff = new Date(Date.now() - delayMinutes * 60 * 1000).toISOString();

    // 13d-A2: one retry on 5xx — the Supabase pooler drops transient
    // connections (observed 500s in E2E r28/r28d), which turned a healthy
    // badge poll into a hard 500 + missed reservation sound.
    const countQuery = async (path: string): Promise<number> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`${url}/rest/v1/${path}`, { headers });
        if (res.ok) {
          const cr = res.headers.get('content-range') || '';
          const m = cr.match(/\/(\d+|\*)/);
          return m && m[1] !== '*' ? Number(m[1]) : 0;
        }
        if (res.status < 500 || attempt === 1) throw new Error(`count failed (${res.status})`);
        await new Promise(r => setTimeout(r, 300));
      }
      throw new Error(`count failed (exhausted)`);
    };

    const [newOrders, readyOrders, pendingReservations, tomorrowReservations, overdueRes, tablesRes] = await Promise.all([
      countQuery(`orders?select=id&status=eq.new&limit=0`),
      countQuery(`orders?select=id&kitchen_status=eq.ready&status=in.(new,confirmed)&paid_at=is.null&closed_at=is.null&limit=0`),
      countQuery(`reservations?select=id&status=eq.pending&date=gte.${todayStr}&limit=0`),
      countQuery(`reservations?select=id&date=eq.${tomorrowStr}&status=not.eq.cancelled&limit=0`),
      fetch(
        `${url}/rest/v1/orders?select=id,table_number&status=in.(new,confirmed)&paid_at=is.null&closed_at=is.null` +
        `&kitchen_status=not.eq.cancelled&table_number=gt.0&created_at=lt.${encodeURIComponent(overdueCutoff)}&limit=200`,
        { headers }
      ),
      fetch(`${url}/rest/v1/table_floors?select=table_number`, { headers }),
    ]);

    const overdueBody: any[] = overdueRes.ok ? await overdueRes.json() : [];
    const tableBody: any[] = tablesRes.ok ? await tablesRes.json() : [];
    const validTables = new Set(tableBody.map((t: any) => t.table_number));
    const overdueTables = [...new Set(
      overdueBody.filter((o: any) => validTables.has(o.table_number)).map((o: any) => o.table_number)
    )];

    return NextResponse.json({
      newOrders,
      readyOrders,
      pendingReservations,
      tomorrowReservations,
      overdueTables,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
