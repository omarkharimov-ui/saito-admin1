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
    const periodId = searchParams.get('period');

    if (!periodId) {
      return NextResponse.json({ error: 'period parameter required' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/payroll_entries?period_id=eq.${periodId}&select=*`, {
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
    const { periodId, format, exportedBy } = body;

    const res = await fetch(`${s.url}/rest/v1/payroll_exports`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        period_id: periodId,
        export_format: format,
        exported_by: exportedBy,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
