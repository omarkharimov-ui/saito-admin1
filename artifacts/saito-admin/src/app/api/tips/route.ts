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
    const today = new Date().toISOString().split('T')[0];

    const res = await fetch(`${s.url}/rest/v1/tip_pools?pool_date=eq.${today}&select=*`, {
      headers: s.headers,
    });

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data[0] || null : null);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const s = svc();
    const body = await req.json();
    const { date } = body;

    const res = await fetch(`${s.url}/rest/v1/rpc/create_tip_pool`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_date: date || new Date().toISOString().split('T')[0] }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
