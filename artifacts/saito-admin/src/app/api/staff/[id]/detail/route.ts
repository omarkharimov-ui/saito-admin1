import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const s = svc();

    const [detailRes, activityRes, permRes, shiftsRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/rpc/get_staff_detail`, { method: 'POST', headers: s.headers, body: JSON.stringify({ p_staff_id: id }) }),
      fetch(`${s.url}/rest/v1/rpc/get_staff_activity`, { method: 'POST', headers: s.headers, body: JSON.stringify({ p_staff_id: id, p_limit: 100, p_offset: 0 }) }),
      fetch(`${s.url}/rest/v1/rpc/get_staff_permissions`, { method: 'POST', headers: s.headers, body: JSON.stringify({ p_staff_id: id }) }),
      fetch(`${s.url}/rest/v1/rpc/get_staff_shifts`, { method: 'POST', headers: s.headers, body: JSON.stringify({ p_staff_id: id }) }),
    ]);

    const detail = await detailRes.json();
    const activity = await activityRes.json();
    const permissions = await permRes.json();
    const shifts = await shiftsRes.json();

    return NextResponse.json({
      detail: Array.isArray(detail) ? detail[0] || null : null,
      activity: Array.isArray(activity) ? activity : [],
      permissions: Array.isArray(permissions) ? permissions : [],
      shifts: Array.isArray(shifts) ? shifts : [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
