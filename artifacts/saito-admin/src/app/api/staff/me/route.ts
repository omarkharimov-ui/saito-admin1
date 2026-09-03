import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const id = auth.user!.id;
    const s = svc();

    // Profile
    const profileRes = await fetch(`${s.url}/rest/v1/staff?select=*,roles(name)&id=eq.${id}&limit=1`, { headers: s.headers });
    const profileRows = await profileRes.json();
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    // Time clock status
    const statusRes = await fetch(`${s.url}/rest/v1/rpc/get_time_clock_status`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_staff_id: id }),
    });
    const clockStatus = await statusRes.json();

    // Lifecycle (schedule binding) - may fail if RPC/function absent
    let lifecycle = null;
    try {
      const lifecycleRes = await fetch(`${s.url}/rest/v1/rpc/get_staff_lifecycle_status`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({}),
      });
      if (lifecycleRes.ok) {
        const rows = await lifecycleRes.json();
        if (Array.isArray(rows)) {
          lifecycle = rows.find((r: any) => r.staff_id === id) || null;
        } else if (rows?.length) {
          lifecycle = (rows as any[]).find((r: any) => r.staff_id === id) || null;
        }
      }
    } catch { /* lifecycle optional */ }

    // Geo / wifi config (restaurant settings)
    let geoConfig = null;
    try {
      const geoRes = await fetch(`${s.url}/rest/v1/app_settings?select=*&key=eq.geo_fence&limit=1`, { headers: s.headers });
      if (geoRes.ok) {
        const g = await geoRes.json();
        if (Array.isArray(g) && g[0]) geoConfig = g[0];
      }
    } catch { /* optional */ }

    return NextResponse.json({
      id,
      name: profile.full_name || profile.name || '',
      role: auth.role,
      role_name: profile.roles?.name || profile.role_name || auth.role,
      avatar: profile.avatar_url || null,
      phone: profile.phone || null,
      email: profile.email || null,
      hourly_rate: profile.hourly_rate || 0,
      overtime_rate: profile.overtime_rate || 0,
      clock_status: clockStatus,
      lifecycle,
      geo_config: geoConfig,
      permissions_granted: true,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
