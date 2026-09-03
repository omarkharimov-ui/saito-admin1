import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// GET /api/staff/swap - list coworkers shifts available to swap + my pending requests
// POST /api/staff/swap - create a swap request
export async function GET(req: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const id = auth.user!.id;
    const s = svc();

    // My pending requests
    let myRequests: any[] = [];
    try {
      const res = await fetch(
        `${s.url}/rest/v1/shift_swap_requests?select=*,requester_schedule:requester_shift_id(schedule_date,planned_start,planned_end),target_schedule:target_shift_id(schedule_date,planned_start,planned_end)&requested_by=eq.${id}&order=created_at.desc`,
        { headers: s.headers }
      );
      if (res.ok) myRequests = (await res.json()) || [];
    } catch { /* optional */ }

    return NextResponse.json({ my_requests: myRequests });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const id = auth.user!.id;
    const s = svc();
    const body = await req.json();
    const { requester_shift_id, target_staff_id, message } = body;

    if (!requester_shift_id || !target_staff_id) {
      return NextResponse.json({ error: 'requester_shift_id and target_staff_id required' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/rpc/request_shift_swap`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_requester_shift_id: requester_shift_id,
        p_target_staff_id: target_staff_id,
        p_target_shift_id: null,
        p_requested_by: id,
        p_message: message || null,
      }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: data?.success === false ? 400 : 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
