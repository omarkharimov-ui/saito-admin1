import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

type Shift = {
  id: string;
  staff_id: string;
  report_date: string;
  opened_at: string;
  closed_at?: string | null;
  starting_cash: number;
  expected_cash: number;
  actual_cash?: number | null;
  difference?: number | null;
  notes?: string | null;
  created_at: string;
};

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission('cash.view', ['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('staff_id');
    const active = searchParams.get('active');
    const period = searchParams.get('period') || '';

    const s = svc();
    let query = `${s.url}/rest/v1/shifts?select=*&order=opened_at.desc`;
    if (staffId) query += `&staff_id=eq.${staffId}`;
    if (active === 'true') query += '&closed_at=is.null';
    if (active === 'false') query += '&closed_at=not.is.null';

    const res = await fetch(query, { headers: s.headers });
    let data = await res.json();

    if (period && period !== 'all' && Array.isArray(data)) {
      const now = new Date();
      const start = new Date();
      if (period === 'today') {
        start.setHours(0, 0, 0, 0);
      } else if (period === 'week') {
        const day = now.getDay() || 7;
        start.setDate(now.getDate() - day + 1);
        start.setHours(0, 0, 0, 0);
      } else if (period === 'month') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
      }
      const startIso = start.toISOString();
      data = data.filter((s: Shift) => s.opened_at >= startIso);
    }

    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('cash.open', ['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { staff_id, expected_cash, notes } = await request.json();
    if (!staff_id) {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/shifts`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        staff_id,
        expected_cash: expected_cash || 0,
        notes: notes || null,
        opened_at: new Date().toISOString(),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to open shift' }, { status: 400 });
    }

    const shift = Array.isArray(data) ? data[0] : data;

    await fetch(`${s.url}/rest/v1/cash_drawer_logs`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        shift_id: shift.id,
        opened_by: staff_id,
        starting_cash: expected_cash || 0,
        expected_cash: expected_cash || 0,
        notes: notes || null,
        opened_at: new Date().toISOString(),
      }),
    });

    await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        action: 'open_shift',
        new_values: { shift_id: shift.id, staff_id, expected_cash },
        performed_by: auth.user?.id,
      }),
    });

    return NextResponse.json({ success: true, data: shift });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePermission('cash.close', ['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { id, closed_at, actual_cash, manager_approved, manager_id, notes } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const s = svc();
    const patch: Record<string, any> = {};
    if (closed_at) patch.closed_at = closed_at;
    if (actual_cash !== undefined) patch.actual_cash = actual_cash;
    if (manager_approved !== undefined) patch.manager_approved = manager_approved;
    if (manager_id) patch.manager_id = manager_id;
    if (notes) patch.notes = notes;

    if (actual_cash !== undefined) {
      const shiftRes = await fetch(`${s.url}/rest/v1/shifts?id=eq.${id}&select=expected_cash`, { headers: s.headers });
      const shiftData = await shiftRes.json();
      const shift = Array.isArray(shiftData) ? shiftData[0] : null;
      if (shift) {
        patch.difference = actual_cash - (shift.expected_cash || 0);
      }
    }

    const res = await fetch(`${s.url}/rest/v1/shifts?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to update shift' }, { status: 400 });
    }

    const updated = Array.isArray(data) ? data[0] : data;

    await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        action: 'close_shift',
        old_values: { id, closed_at: null },
        new_values: { id, closed_at: updated.closed_at, actual_cash: updated.actual_cash, difference: updated.difference },
        performed_by: auth.user?.id,
      }),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
