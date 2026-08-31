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
    const res = await fetch(`${s.url}/rest/v1/rpc/get_live_shifts`, { method: 'POST', headers: s.headers, body: '{}' });
    const data = await res.json();
    return NextResponse.json({ shifts: Array.isArray(data) ? data : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const s = svc();
    const body = await request.json();
    const { action, shift_id, actual_cash, reason } = body;

    if (action === 'close' && shift_id) {
      const res = await fetch(`${s.url}/rest/v1/rpc/close_shift_atomic`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_shift_id: shift_id, p_actual_cash: actual_cash, p_reason: reason || null }),
      });
      const data = await res.json();
      return NextResponse.json({ success: true, result: data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
