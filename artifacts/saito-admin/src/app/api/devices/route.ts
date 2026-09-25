import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * 2026-09-25 (owner, decision): Device health — heartbeat + status list.
 * PHASE 0 (device identity): deviceId (stabil UUID) + meta (OS/browser,
 * ekran, battery, app version) + UNPAIR (blocked → 403 DEVICE_BLOCKED).
 *
 * POST { deviceName, deviceType, deviceId?, meta? }
 *   → upsert heartbeat (hər cihaz 30s-də bir); blocked cihaz → 403 {code:'DEVICE_BLOCKED'}
 * GET → bütün cihazlar + status (online = ≤45s) + meta + device_id + first_seen + blocked
 */
const DEVICE_TYPES = ['pos', 'kds', 'bds', 'expo', 'admin', 'other'] as const;
const ONLINE_WINDOW_MS = 45_000;
const META_MAX_CHARS = 2048;

async function getLocationId() {
  const supabase = await createAuthClient();
  const { data } = await supabase.from('orders').select('location_id').limit(1);
  return data?.[0]?.location_id || null;
}

function sanitizeMeta(meta: any): Record<string, unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out: Record<string, unknown> = {};
  const str = (v: any, max = 64) => (typeof v === 'string' && v.length <= max ? v : undefined);
  out.os = str(meta.os, 64);
  out.browser = str(meta.browser, 64);
  out.screen = str(meta.screen, 32);
  out.app_version = str(meta.app_version, 32);
  if (meta.battery && typeof meta.battery === 'object') {
    const lvl = Number(meta.battery.level);
    if (Number.isFinite(lvl) && lvl >= 0 && lvl <= 1) {
      out.battery = { level: lvl, charging: !!meta.battery.charging };
    }
  }
  const json = JSON.stringify(out);
  if (json.length > META_MAX_CHARS) return {};
  return out;
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
    const deviceId = typeof body.deviceId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(body.deviceId)
      ? body.deviceId
      : null;
    const meta = sanitizeMeta(body.meta);
    if (!deviceName) return NextResponse.json({ error: 'deviceName required' }, { status: 400 });

    const locationId = await getLocationId();
    const supabase = await createAuthClient();

    // Phase 0 upsert: device_id varsa (location, device_id) — stabil kimlik;
    // yoxdursa (legacy client, deploy dövrü) (location, device_name) — köhnə yol.
    const row: any = {
      location_id: locationId,
      device_name: deviceName,
      device_type: deviceType,
      last_seen_at: new Date().toISOString(),
    };
    let onConflict = 'location_id,device_name';
    if (deviceId) {
      row.device_id = deviceId;
      row.meta = meta;
      onConflict = 'location_id,device_id';
    }
    const { data: upserted, error } = await supabase
      .from('device_heartbeats')
      .upsert(row, { onConflict, count: 'exact' })
      .select('blocked')
      .limit(1);
    if (error) throw error;
    const upsertedRow: any = upserted;
    const blocked = !!(upsertedRow ? (Array.isArray(upsertedRow) ? upsertedRow[0]?.blocked : upsertedRow.blocked) : false);
    if (blocked) {
      return NextResponse.json(
        { error: 'Device is blocked', code: 'DEVICE_BLOCKED' },
        { status: 403 },
      );
    }
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
      .select('device_name, device_type, last_seen_at, meta, device_id, first_seen_at, blocked, blocked_at')
      .order('last_seen_at', { ascending: false });
    if (error) throw error;

    const now = Date.now();
    const devices = (data || []).map((d: any) => {
      const seen = new Date(d.last_seen_at).getTime();
      const online = Number.isFinite(seen) && now - seen <= ONLINE_WINDOW_MS;
      const firstSeen = d.first_seen_at ? new Date(d.first_seen_at).getTime() : null;
      return {
        name: d.device_name,
        type: d.device_type,
        device_id: d.device_id || null,
        first_seen_at: d.first_seen_at || null,
        // YENİ badge: ilk görülmə 24s içində
        is_new: Number.isFinite(firstSeen as number) && now - (firstSeen as number) < 86_400_000,
        blocked: !!d.blocked,
        blocked_at: d.blocked_at || null,
        meta: d.meta && typeof d.meta === 'object' ? d.meta : null,
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
