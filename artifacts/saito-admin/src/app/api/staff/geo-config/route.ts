import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// GET /api/staff/geo-config => restaurant Wi-Fi SSIDs + geofence center/radius
export async function GET() {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const s = svc();

    let settings: any = {};
    try {
      const res = await fetch(`${s.url}/rest/v1/app_settings?select=*&limit=50`, { headers: s.headers });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          for (const r of rows) settings[r.key] = r.value;
        }
      }
    } catch { /* optional */ }

    const fallback = {
      ssids: [],
      geofence: { enabled: false, lat: null, lng: null, radius_m: 200 },
    };

    let parsed: any = {};
    try {
      if (settings.geo_fence && typeof settings.geo_fence === 'string') parsed = JSON.parse(settings.geo_fence);
      else if (settings.geo_fence && typeof settings.geo_fence === 'object') parsed = settings.geo_fence;
    } catch { /* fallback */ }

    return NextResponse.json({
      ssids: parsed?.ssids || settings.wifi_ssids || fallback.ssids,
      geofence: {
        enabled: parsed?.enabled ?? false,
        lat: parsed?.lat ?? null,
        lng: parsed?.lng ?? null,
        radius_m: parsed?.radius_m ?? 200,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
