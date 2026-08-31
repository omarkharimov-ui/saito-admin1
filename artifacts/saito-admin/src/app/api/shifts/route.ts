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
    const auth = await requirePermission('cash.view');
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
    const auth = await requirePermission('cash.open');
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { staff_id, notes } = body;

    if (!staff_id) {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
    }

    const s = await (await import('@/lib/api-auth')).createAuthClient();

    const { data, error: rpcError } = await s.rpc('clock_in_atomic', {
      p_staff_id: staff_id,
      p_notes: notes || null,
      p_performed_by: auth.user?.id || staff_id,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePermission('cash.close');
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { id, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const s = await (await import('@/lib/api-auth')).createAuthClient();

    const { data, error: rpcError } = await s.rpc('clock_out_atomic', {
      p_staff_id: id,
      p_notes: notes || null,
      p_performed_by: auth.user?.id || id,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
