import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('reports.view');
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all';
    const staffId = searchParams.get('staff_id') || '';

    const s = svc();
    let query = '';

    if (period === 'daily') {
      query = `${s.url}/rest/v1/v_daily_staff_performance?order=report_date.desc`;
      if (staffId) {
        query += `&staff_id=eq.${staffId}`;
      }
    } else {
      query = `${s.url}/rest/v1/v_staff_performance?order=total_revenue.desc`;
      if (staffId) {
        query += `&staff_id=eq.${staffId}`;
      }
    }

    const res = await fetch(query, { headers: s.headers });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data?.message || 'Failed to fetch reports' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
