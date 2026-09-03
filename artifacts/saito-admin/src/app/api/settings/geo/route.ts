import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// PATCH /api/settings/geo
// body: { ssids: string[], geofence: { enabled, lat, lng, radius_m } }
export async function PATCH(req: Request) {
  try {
    const auth = await requirePermission('settings.admin');
    if (auth instanceof NextResponse) return auth;
    const s = svc();
    const body = await req.json();
    const { ssids, geofence } = body;

    const payload = JSON.stringify({ ssids: ssids || [], ...geofence });

    const res = await fetch(`${s.url}/rest/v1/app_settings?key=eq.geo_fence`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ value: payload, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      // Row may not exist yet -> upsert (insert on missing)
      const insertRes = await fetch(`${s.url}/rest/v1/app_settings?on_conflict=key`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ key: 'geo_fence', value: payload, updated_at: new Date().toISOString() }),
      });
      if (!insertRes.ok) {
        const e = await insertRes.text();
        return NextResponse.json({ error: e }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, config: { ssids, geofence } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
