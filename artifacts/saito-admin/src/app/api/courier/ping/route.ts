// ============================================================================
// 2026-10-02 (12a): COURIER APP — LIVE GPS PING.
// The courier's phone posts its location every ~20 s (watchPosition) while
// an order is active. Upserted into courier_location (one row per courier —
// the admin dispatch map reads last_location_*). Sanity-clamped to AZ bounds
// (a GPS glitch must not put the courier in the Atlantic).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getCookieCourier } from '../../lib/courier-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const me = await getCookieCourier(req);
    if (!me) return NextResponse.json({ error: 'Cəlb olunmayıb' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'Koordinat yoxdur' }, { status: 400 });
    if (lat < 36 || lat > 43 || lng < 44 || lng > 52) {
      // outside Azerbaijan — GPS drift; ignore silently (the map keeps the last good point)
      return NextResponse.json({ success: true, ignored: true });
    }
    const orderId = typeof body.order_id === 'string' && body.order_id ? body.order_id : null;

    const s = svc();
    // upsert: one row per courier. 12c: `t` MUST be in the body — PostgREST
    // upsert's ON CONFLICT DO UPDATE only sets the supplied columns, so the
    // column DEFAULT now() applied on first INSERT but NEVER on conflict →
    // t stayed stale and the smooth-marker engine (which interleaves pings
    // by server time) rejected every new ping as "out of order".
    const res = await fetch(`${s.url}/rest/v1/courier_location?on_conflict=courier_id`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ courier_id: me.id, lat, lng, order_id: orderId, t: new Date().toISOString() }),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Ping etmir: ${err}`.slice(0, 200) }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Xəta' }, { status: 500 });
  }
}
