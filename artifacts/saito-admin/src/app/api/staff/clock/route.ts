import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// /api/staff/clock
// body: { action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end', pin?, break_type? }
export async function POST(req: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const id = auth.user!.id;
    const s = svc();
    const body = await req.json();
    const { action, pin, break_type } = body;

    const source = 'mobile_app';

    if (action === 'clock_in') {
      if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
      const res = await fetch(`${s.url}/rest/v1/rpc/clock_in`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_staff_id: id, p_pin: pin, p_source: source }),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: data?.success === false ? 400 : 200 });
    }

    if (action === 'clock_out') {
      if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
      const notes = body.notes || null;
      const res = await fetch(`${s.url}/rest/v1/rpc/clock_out`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_staff_id: id, p_pin: pin, p_notes: notes }),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: data?.success === false ? 400 : 200 });
    }

    if (action === 'break_start') {
      const res = await fetch(`${s.url}/rest/v1/rpc/start_break`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_staff_id: id, p_break_type: break_type || 'unpaid' }),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: data?.success === false ? 400 : 200 });
    }

    if (action === 'break_end') {
      const res = await fetch(`${s.url}/rest/v1/rpc/end_break`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_staff_id: id }),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: data?.success === false ? 400 : 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
