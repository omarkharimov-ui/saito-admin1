import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// /api/staff/schedule?week_offset=0
export async function GET(req: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const id = auth.user!.id;
    const s = svc();

    const url = new URL(req.url);
    const weekOffset = parseInt(url.searchParams.get('week_offset') || '0', 10);

    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay() + 1 + weekOffset * 7); // Monday
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // Sunday

    const startIso = start.toISOString().split('T')[0];
    const endIso = end.toISOString().split('T')[0];

    const res = await fetch(
      `${s.url}/rest/v1/schedule?select=*&staff_id=eq.${id}&schedule_date=gte.${startIso}&schedule_date=lte.${endIso}&order=schedule_date.asc,planned_start.asc`,
      { headers: s.headers }
    );
    const schedule = await res.json();
    const rows = Array.isArray(schedule) ? schedule : [];

    // Shift swap requests for my shifts
    let swaps: any[] = [];
    try {
      const shiftIds = rows.map((r: any) => r.id).filter(Boolean);
      let swapRows: any[] = [];
      if (shiftIds.length) {
        for (let i = 0; i < shiftIds.length; i += 20) {
          const chunk = shiftIds.slice(i, i + 20);
          const q = chunk.map((sid) => `requester_shift_id=eq.${sid}`).join('&');
          const swapRes = await fetch(`${s.url}/rest/v1/shift_swap_requests?select=*&or=(${q})`, { headers: s.headers });
          if (swapRes.ok) {
            const arr = await swapRes.json();
            if (Array.isArray(arr)) swapRows = swapRows.concat(arr);
          }
        }
      }
      swaps = swapRows;
    } catch { /* optional */ }

    return NextResponse.json({
      week_start: startIso,
      week_end: endIso,
      shifts: rows.map((r: any) => ({
        schedule_id: r.id,
        date: r.schedule_date,
        planned_start: r.planned_start,
        planned_end: r.planned_end,
        notes: r.notes || null,
      })),
      swap_requests: swaps,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
