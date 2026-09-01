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
    const { shiftId, staffId, denominations } = body;

    const res = await fetch(`${s.url}/rest/v1/rpc/create_reconciliation`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_shift_id: shiftId,
        p_staff_id: staffId,
        p_denominations: JSON.stringify(denominations),
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const s = svc();
    const { searchParams } = new URL(req.url);
    const shiftId = searchParams.get('shift');

    if (!shiftId) {
      return NextResponse.json({ error: 'shift parameter required' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/rpc/get_reconciliation_summary`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_shift_id: shiftId }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
