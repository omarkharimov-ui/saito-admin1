import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: Request) {
  try {
    const s = svc();
    const body = await req.json();
    const { staff_id, new_pin } = body;

    if (!staff_id) {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/rpc/reset_staff_pin`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_staff_id: staff_id,
        p_new_pin: new_pin || null,
        p_performed_by: null,
      }),
    });

    const data = await res.json();

    if (data?.success) {
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ error: data?.error || 'Failed to reset PIN' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
