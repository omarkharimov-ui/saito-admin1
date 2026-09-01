import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  try {
    const s = svc();

    const [staffRes, shiftsRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/staff?select=*&is_active=eq.true&order=name.asc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/shifts?select=*,staff:staff_id(name,role:role_id(name))&closed_at=is.null&order=opened_at.desc`, { headers: s.headers }),
    ]);

    const staff = await staffRes.json();
    const liveShifts = await shiftsRes.json();

    const roleMap = new Map<string, string>();
    const staffWithRole = (Array.isArray(staff) ? staff : []).map((s: any) => {
      if (s.role && s.role.name) roleMap.set(s.id, s.role.name);
      return s;
    });

    const shiftMap = new Map<string, any>();
    if (Array.isArray(liveShifts)) {
      for (const sh of liveShifts) {
        if (sh.staff_id) shiftMap.set(sh.staff_id, sh);
      }
    }

    const enriched = staffWithRole.map((m: any) => {
      const shift = shiftMap.get(m.id);
      return {
        ...m,
        role_name: roleMap.get(m.id) || m.role_name || '—',
        shift_status: shift ? 'active' : 'off',
        shift_id: shift?.id || null,
        shift_opened_at: shift?.opened_at || null,
        active_shift: shift ? {
          id: shift.id,
          opened_at: shift.opened_at,
          starting_cash: shift.starting_cash || 0,
          duration_minutes: shift.duration_minutes || 0,
        } : null,
      };
    });

    const kpis = {
      total_staff: enriched.length,
      active_staff: enriched.length,
      on_shift: enriched.filter((m: any) => m.shift_status === 'active').length,
      off_shift: enriched.filter((m: any) => m.shift_status === 'off').length,
      today_orders: 0,
      today_revenue: 0,
      open_cash_drawers: 0,
      cash_variance: 0,
      risk_alerts: enriched.filter((m: any) => (m.risk_score || 0) > 50).length,
      labor_cost_today: 0,
      avg_ticket_size: 0,
      high_risk_voids: 0,
    };

    return NextResponse.json({
      kpis,
      staff: enriched,
      liveShifts: Array.isArray(liveShifts) ? liveShifts : [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
