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
    const start = searchParams.get('start') || new Date().toISOString().split('T')[0];
    const end = searchParams.get('end') || new Date().toISOString().split('T')[0];

    const res = await fetch(`${s.url}/rest/v1/schedule?schedule_date=gte.${start}&schedule_date=lte.${end}&select=*&order=schedule_date.planned_start`, {
      headers: { ...s.headers, 'Prefer': 'return=representation' },
    });
    const data = await res.json();
    return NextResponse.json({ schedule: Array.isArray(data) ? data : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const s = svc();
    const body = await req.json();
    const res = await fetch(`${s.url}/rest/v1/schedule`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
