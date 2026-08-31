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

    const [kpisRes, staffRes, shiftsRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/rpc/get_staff_kpis`, { method: 'POST', headers: s.headers, body: '{}' }),
      fetch(`${s.url}/rest/v1/rpc/get_staff_directory`, { method: 'POST', headers: s.headers, body: '{}' }),
      fetch(`${s.url}/rest/v1/rpc/get_live_shifts`, { method: 'POST', headers: s.headers, body: '{}' }),
    ]);

    const kpis = await kpisRes.json();
    const staff = await staffRes.json();
    const liveShifts = await shiftsRes.json();

    return NextResponse.json({
      kpis: kpis || {},
      staff: Array.isArray(staff) ? staff : [],
      liveShifts: Array.isArray(liveShifts) ? liveShifts : [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
