import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

/**
 * 2026-09-25 (Phase 0) — Remote command: Admin → cihaz.
 *
 * POST { device_id, command: 'reload' }  (settings.admin)
 *   → device_commands insert (service role) → cihazın Realtime subscription-u
 *     (filter: device_id=eq.<id>) INSERT-i görür → window.location.reload().
 *
 * İndiki komanda: 'reload' (donmuş ekranı uzaqdan təzələmə).
 * (Wrap fazada: 'restart', 'update' — Phase 1.)
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
    const command = body.command === 'reload' ? 'reload' : null;
    if (!deviceId || !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId) || !command) {
      return NextResponse.json({ error: "device_id + command ('reload') required" }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/device_commands`, {
      method: 'POST',
      headers: { ...s.headers, Prefer: 'return=representation' },
      body: JSON.stringify({ device_id: deviceId, command, payload: {} }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `command_failed: ${t.slice(0, 160)}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, device_id: deviceId, command });
  } catch (err: any) {
    console.error('[devices/command]', err?.message || err);
    return NextResponse.json({ error: 'command_failed' }, { status: 500 });
  }
}
