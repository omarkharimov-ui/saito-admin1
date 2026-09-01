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

    if (!staffId) {
      return NextResponse.json({ error: 'staff parameter required' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/rpc/get_review_history`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_staff_id: staffId }),
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
    const { staffId, reviewerId, periodStart, periodEnd } = body;

    const res = await fetch(`${s.url}/rest/v1/rpc/create_review`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_staff_id: staffId,
        p_reviewer_id: reviewerId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
