import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('staff_id');
    const active = searchParams.get('active');

    const s = svc();
    let query = `${s.url}/rest/v1/shifts?select=*&order=opened_at.desc`;
    if (staffId) query += `&staff_id=eq.${staffId}`;
    if (active === 'true') query += '&closed_at=is.null';

    const res = await fetch(query, { headers: s.headers });
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
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

    return NextResponse.json({ success: true, data: shift });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
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

    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] : data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
