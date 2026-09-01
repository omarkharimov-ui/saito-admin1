import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('staff_id');
    const periodStart = searchParams.get('period_start') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const periodEnd = searchParams.get('period_end') || new Date().toISOString().split('T')[0];

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/rpc/get_splh_metrics?p_staff_id=${staffId || ''}&p_period_start=${periodStart}&p_period_end=${periodEnd}`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_staff_id: staffId || null,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to get SPLH metrics' }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
