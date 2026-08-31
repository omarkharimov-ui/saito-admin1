import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(req: Request) {
  try {
    const s = svc();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Get schedule for the date
    const scheduleRes = await fetch(`${s.url}/rest/v1/schedule?schedule_date=eq.${date}&select=*`, { headers: s.headers });
    const schedule = await scheduleRes.json();

    // Get actual shifts for the date
    const shiftsRes = await fetch(`${s.url}/rest/v1/shifts?opened_at=gte.${date}T00:00:00&opened_at=lte.${date}T23:59:59&select=*`, { headers: s.headers });
    const shifts = await shiftsRes.json();

    const records = (Array.isArray(schedule) ? schedule : []).map((s: any) => {
      const actualShift = (Array.isArray(shifts) ? shifts : []).find((sh: any) => sh.staff_id === s.staff_id);
      const scheduledStart = s.planned_start;
      const actualStart = actualShift ? actualShift.opened_at.split('T')[1].substring(0, 5) : null;
      const lateMinutes = actualStart ? Math.max(0, (parseInt(actualStart.split(':')[0]) * 60 + parseInt(actualStart.split(':')[1])) - (parseInt(scheduledStart.split(':')[0]) * 60 + parseInt(scheduledStart.split(':')[1]))) : 0;

      return {
        staff_id: s.staff_id,
        staff_name: s.staff_name || 'Unknown',
        role: s.staff_role || '',
        scheduled_start: scheduledStart,
        scheduled_end: s.planned_end,
        actual_start: actualStart,
        actual_end: actualShift?.closed_at ? actualShift.closed_at.split('T')[1].substring(0, 5) : null,
        late_minutes: lateMinutes,
        overtime_minutes: 0,
        status: !actualShift ? 'absent' : lateMinutes > 5 ? 'late' : 'present',
      };
    });

    return NextResponse.json({ records });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
