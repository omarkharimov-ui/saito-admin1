import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// GET /api/payroll/export/history — recent payroll exports (newest first) with period info + exporter name.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const s = svc();

    const res = await fetch(
      `${s.url}/rest/v1/payroll_exports?select=*,period:payroll_periods(period_start,period_end,status),exporter:staff(name)&order=exported_at.desc&limit=50`,
      { headers: s.headers }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `history fetch failed (${res.status})`);
    }

    const rows = await res.json();
    return NextResponse.json({ exports: Array.isArray(rows) ? rows : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
