import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

/**
 * 2026-09-25 (Phase 0) — UNPAIR: cihazı blokla / bərpa et.
 *
 * POST { device_id, blocked: boolean }  (settings.admin)
 *   - blocked=true  → cihaz heartbeat-də 403 DEVICE_BLOCKED alar, lockout ekranı
 *   - blocked=false → qeydiyyatlı qalır, normal beat davam edir
 *
 * Oğurlanma/dəyişmə halı: cihaz bloklanır; admin "Bərpa et" ilə açar.
 * (Wrap fazada: + push token revoke — Phase 2.)
 */

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('settings.admin');
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const deviceId = typeof body.device_id === 'string' ? body.device_id.trim().slice(0, 64) : '';
    if (!deviceId || !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId)) {
      return NextResponse.json({ error: 'device_id required' }, { status: 400 });
    }
    const block = body.blocked === true;

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/device_heartbeats?device_id=eq.${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        blocked: block,
        blocked_at: block ? new Date().toISOString() : null,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `unpair_failed: ${t.slice(0, 160)}` }, { status: 502 });
    }
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Device tapılmadı' }, { status: 404 });
    }
    return NextResponse.json({ success: true, device_id: deviceId, blocked: block });
  } catch (err: any) {
    console.error('[devices/unpair]', err?.message || err);
    return NextResponse.json({ error: 'unpair_failed' }, { status: 500 });
  }
}
