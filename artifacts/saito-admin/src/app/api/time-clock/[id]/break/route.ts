import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = svc();
    const { id } = await params;
    const body = await req.json();
    const { breakType } = body;

    const res = await fetch(`${s.url}/rest/v1/rpc/start_break`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_staff_id: id, p_break_type: breakType || 'unpaid' }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = svc();
    const { id } = await params;

    const res = await fetch(`${s.url}/rest/v1/rpc/end_break`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_staff_id: id }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
