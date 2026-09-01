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
    const staffId = searchParams.get('staff');

    if (staffId) {
      const res = await fetch(`${s.url}/rest/v1/rpc/get_staff_locations`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_staff_id: staffId }),
      });
      const data = await res.json();
      return NextResponse.json(Array.isArray(data) ? data : []);
    }

    const res = await fetch(`${s.url}/rest/v1/locations?select=*&is_active=eq.true&order=name`, {
      headers: s.headers,
    });
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const s = svc();
    const body = await req.json();
    const { name, address, phone, timezone } = body;

    const res = await fetch(`${s.url}/rest/v1/locations`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ name, address, phone, timezone }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
