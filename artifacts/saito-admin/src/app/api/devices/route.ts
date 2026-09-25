import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * 2026-09-25 (owner, decision): Device health — heartbeat + status list.
 *
 * POST { deviceName, deviceType }  → upsert heartbeat (hər cihaz 30s-də bir)
 * GET                              → bütün cihazlar + status (online = ≤45s)
 */
const DEVICE_TYPES = ['pos', 'kds', 'bds', 'expo', 'admin', 'other'] as const;
const ONLINE_WINDOW_MS = 45_000;

async function getLocationId() {
  const supabase = await createAuthClient();
  const { data } = await supabase.from('orders').select('location_id').limit(1);
  return data?.[0]?.location_id || null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const deviceName = String(body.deviceName || '').trim().slice(0, 64);
    const deviceType = DEVICE_TYPES.includes(body.deviceType) ? body.deviceType : 'other';
    if (!deviceName) return NextResponse.json({ error: 'deviceName required' }, { status: 400 });

    const locationId = await getLocationId();
    const supabase = await createAuthClient();
    await supabase.from('device_heartbeats').upsert(
      { location_id: locationId, device_name: deviceName, device_type: deviceType, last_seen_at: new Date().toISOString(), meta: {} },
      { onConflict: 'location_id,device_name' }
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[devices/heartbeat]', err?.message || err);
    return NextResponse.json({ error: 'heartbeat_failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();
    const { data, error } = await supabase
      .from('device_heartbeats')
      .select('device_name, device_type, last_seen_at, meta')
      .order('last_seen_at', { ascending: false });
    if (error) throw error;

    const now = Date.now();
    const devices = (data || []).map((d: any) => {
      const seen = new Date(d.last_seen_at).getTime();
      const online = Number.isFinite(seen) && now - seen <= ONLINE_WINDOW_MS;
      return {
        name: d.device_name,
        type: d.device_type,
        last_seen_at: d.last_seen_at,
        online,
        seconds_ago: Number.isFinite(seen) ? Math.max(0, Math.round((now - seen) / 1000)) : null,
      };
    });
    return NextResponse.json({ devices });
  } catch (err: any) {
    console.error('[devices]', err?.message || err);
    return NextResponse.json({ error: 'devices_failed' }, { status: 500 });
  }
}
