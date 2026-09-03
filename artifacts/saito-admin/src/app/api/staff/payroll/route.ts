import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// /api/staff/payroll?period_start=YYYY-MM-DD&period_end=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const id = auth.user!.id;
    const s = svc();

    const url = new URL(req.url);
    const end = url.searchParams.get('period_end') || new Date().toISOString().split('T')[0];
    const start = url.searchParams.get('period_start') || (() => {
      const d = new Date(end);
      d.setDate(d.getDate() - 6);
      return d.toISOString().split('T')[0];
    })();

    // Shifts (hours worked) in period
    const shiftsRes = await fetch(
      `${s.url}/rest/v1/shifts?select=opened_at,closed_at,starting_cash,expected_cash,actual_cash,over_short,status&staff_id=eq.${id}&closed_at=is.not.null&opened_at=gte.${start}T00:00:00&opened_at=lte.${end}T23:59:59`,
      { headers: s.headers }
    );
    const shifts = (await shiftsRes.json()) || [];

    // Time clock captured hours
    let hourEntries: any[] = [];
    try {
      const hRes = await fetch(
        `${s.url}/rest/v1/time_clock_entries?select=timestamp,entry_type&staff_id=eq.${id}&timestamp=gte.${start}T00:00:00&timestamp=lte.${end}T23:59:59&order=timestamp.asc`,
        { headers: s.headers }
      );
      if (hRes.ok) hourEntries = (await hRes.json()) || [];
    } catch { /* optional */ }

    // Tips distributions
    let tips: any[] = [];
    try {
      const tipsRes = await fetch(
        `${s.url}/rest/v1/tip_distributions?select=*,tip_pools(pool_date,total_amount,status)&staff_id=eq.${id}&created_at=gte.${start}T00:00:00&created_at=lte.${end}T23:59:59&order=created_at.desc`,
        { headers: s.headers }
      );
      if (tipsRes.ok) tips = (await tipsRes.json()) || [];
    } catch { /* optional */ }

    let totalHours = 0;
    for (const sh of shifts) {
      if (sh.opened_at && sh.closed_at) {
        totalHours += (new Date(sh.closed_at).getTime() - new Date(sh.opened_at).getTime()) / 3600000;
      }
    }

    let clockMinutes = 0;
    let clockInTs: string | null = null;
    for (const entry of hourEntries) {
      if (entry.entry_type === 'clock_in') clockInTs = entry.timestamp;
      else if (entry.entry_type === 'clock_out' && clockInTs) {
        clockMinutes += (new Date(entry.timestamp).getTime() - new Date(clockInTs).getTime()) / 60000;
        clockInTs = null;
      }
    }

    return NextResponse.json({
      period_start: start,
      period_end: end,
      hours_worked: Math.round(totalHours * 100) / 100,
      clocked_minutes: Math.round(clockMinutes),
      shifts_count: shifts.length,
      tips_total: tips.reduce((a, t) => a + (Number(t.amount) || 0), 0),
      tips,
      shifts,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
