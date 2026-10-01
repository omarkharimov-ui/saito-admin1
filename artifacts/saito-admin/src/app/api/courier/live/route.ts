// ============================================================================
// 2026-10-02 (12a): ADMIN — LIVE COURIER DISPATCH DATA (requireAuth).
// One response feeds the "Kurye xəritəsi" modal:
//   - venue point (operator location, same D-5 resolution the geocode uses)
//   - every courier (staff role 'courier' + legacy active) with their LAST
//     GPS ping (courier_location) + freshness
//   - every active delivery order (not delivered/cancelled) with customer
//     point + assigned courier + delivery_status
// The modal polls this every 30 s — 3 small service-role reads, no Nominatim,
// no OSRM (keyless, cheap).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const s = svc();
    const out: any = { venue: null, couriers: [], orders: [] };

    // 1) venue — operator location (D-5) → any active with coords
    try {
      const supabase = await createAuthClient();
      let loc: any = null;
      const opLoc = await resolveWriteLocationContext(auth.user!.id);
      if (opLoc?.locationId) {
        const { data } = await supabase.from('locations').select('id, latitude, longitude').eq('id', opLoc.locationId).maybeSingle();
        loc = data;
      }
      if (!loc || loc.latitude == null || loc.longitude == null) {
        const { data } = await supabase.from('locations').select('id, latitude, longitude').eq('is_active', true).limit(10);
        loc = (data || []).find((r: any) => r.latitude != null && r.longitude != null) || null;
      }
      if (loc) out.venue = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
    } catch { /* venue optional */ }

    // 2) couriers (staff role 'courier' SSOT + legacy) with last ping
    const cRes = await fetch(`${s.url}/rest/v1/rpc/get_courier_staff`, { method: 'POST', headers: s.headers });
    if (cRes.ok) {
      const couriers: any[] = await cRes.json();
      out.couriers = couriers.map((c) => ({ id: c.id, name: c.name, phone: c.phone || null, kind: c.kind }));
    }
    if (out.couriers.length) {
      const ids = out.couriers.map((c: any) => c.id).join(',');
      const lRes = await fetch(`${s.url}/rest/v1/courier_location?courier_id=in.(${ids})&select=courier_id,lat,lng,order_id,t`, { headers: s.headers });
      if (lRes.ok) {
        const locs: any[] = await lRes.json();
        const map = new Map(locs.map((l) => [l.courier_id, l]));
        for (const c of out.couriers) {
          const l = map.get(c.id);
          c.last_lat = l ? Number(l.lat) : null;
          c.last_lng = l ? Number(l.lng) : null;
          c.last_at = l ? l.t : null;
          c.last_order_id = l ? l.order_id : null;
        }
      }
    }

    // 3) active delivery orders + customer points
    const oRes = await fetch(
      `${s.url}/rest/v1/orders` +
      `?order_source=eq.delivery&status=not.in.(cancelled,voided,refunded,partially_refunded)` +
      `&delivery_status=not.in.(delivered,cancelled)` +
      `&select=id,order_number,delivery_status,courier_id,courier_name,customer_name,customer_phone,customer_lat,customer_lng,delivery_km,created_at&limit=50`,
      { headers: s.headers },
    );
    if (oRes.ok) out.orders = (await oRes.json()).map((o: any) => ({ ...o, customer_lat: o.customer_lat != null ? Number(o.customer_lat) : null, customer_lng: o.customer_lng != null ? Number(o.customer_lng) : null }));

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Xəta' }, { status: 500 });
  }
}
