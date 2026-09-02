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
    const res = await fetch(`${s.url}/rest/v1/rpc/get_staff_lifecycle_status`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: 'Lifecycle RPC failed', detail: txt }, { status: 502 });
    }

    const data = await res.json();

    const byStaff = new Map<string, any>();
    if (Array.isArray(data)) {
      for (const row of data) byStaff.set(row.staff_id, row);
    }

    return NextResponse.json({ lifecycle: Object.fromEntries(byStaff) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
