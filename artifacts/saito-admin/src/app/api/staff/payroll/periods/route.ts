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
    const res = await fetch(`${s.url}/rest/v1/payroll_periods?select=*&order=period_start.desc`, { headers: s.headers });
    const data = await res.json();
    return NextResponse.json({ periods: Array.isArray(data) ? data : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
