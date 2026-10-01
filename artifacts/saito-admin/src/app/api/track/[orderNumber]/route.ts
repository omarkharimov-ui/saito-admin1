// ============================================================================
// 2026-10-02 (12c): PUBLIC ORDER TRACKING — the customer-facing data feed.
//
// GET /api/track/<orderNumber> — NO AUTH (the customer holds only the order
// number from the checkout success screen / SMS). Returns ONLY what the
// Wolt-style tracking page needs:
//   - status (delivery_status + AZ label), items (name+qty), total
//   - customer point + venue point (map markers)
//   - road route geometry (OSRM, in-memory cached — a repeat view costs 0
//     external calls) + km + minutes
//   - assigned courier NAME (never id/phone)
//   - delivered_at
// NO customer name, phone, or address text leaves this endpoint.
//
// The courier's LIVE position is NOT here — the /track page subscribes to
// Supabase Realtime on `courier_location` (anon SELECT, 12c migration) and
// filters by the courier_id this endpoint returns… except we also do NOT
// expose the courier id: the page instead shows the ONE courier dot that is
// pinging (SAITO operates a small fleet; the dispatch map shows the same).
// To stay precise, we DO return courier_id — it is an internal uuid (not
// guessable, not a phone), needed to filter the realtime stream.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { osrmRoute } from '../../lib/osrm';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } };
}

const STATUS_AZ: Record<string, string> = {
  pending: 'Qəbul edildi',
  confirmed: 'Qəbul edildi',
  preparing: 'Hazırlanır',
  in_kitchen: 'Hazırlanır',
  ready: 'Hazırdır',
  waiting_courier: 'Kurye gözləyir',
  picked_up: 'Paket götürüldü',
  in_transit: 'Yolda',
  delivered: 'Təhvil verildi',
  cancelled: 'Ləğv edildi',
};

// route geometry cache: venue+customer pair → geometry (OSRM is free but
// rate-limited; the same order is viewed many times)
const ROUTE_MEMO = new Map<string, { geometry: [number, number][] | null; km: number; minutes: number; t: number }>();

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderNumber: string }> }) {
  try {
    const { orderNumber } = await ctx.params;
    const raw = (orderNumber || '').trim().replace(/^#/, '');
    if (!raw) return NextResponse.json({ error: 'order number missing' }, { status: 400 });
    const s = svc();

    // match by order_number — the DB stores it WITH the '#' prefix
    // ("#D083"), customers type/see it without ("D083"); try both forms.
    // Fall back to uuid (legacy /kitchen/track links).
    const SEL = 'id,order_number,order_source,status,delivery_status,total_amount,customer_lat,customer_lng,courier_id,courier_name,delivered_at,estimated_delivery_time';
    let q = `${s.url}/rest/v1/orders?order_number=in.(${encodeURIComponent(raw)},${encodeURIComponent('#' + raw)})&select=${SEL}&limit=1`;
    let res = await fetch(q, { headers: s.headers });
    let rows: any[] = res.ok ? await res.json() : [];
    if (!rows.length && /^[0-9a-f-]{36}$/.test(raw)) {
      q = `${s.url}/rest/v1/orders?id=eq.${raw}&select=${SEL}&limit=1`;
      res = await fetch(q, { headers: s.headers });
      rows = res.ok ? await res.json() : [];
    }
    if (!rows.length) return NextResponse.json({ error: 'Order tapılmadı' }, { status: 404 });
    const o = rows[0];
    if (o.order_source !== 'delivery') {
      return NextResponse.json({ error: 'Bu sifariş çatdırılma deyil' }, { status: 400 });
    }

    // items (name + qty only)
    let items: { name: string; qty: number }[] = [];
    const itRes = await fetch(`${s.url}/rest/v1/order_items?order_id=eq.${o.id}&select=product_name,quantity`, { headers: s.headers });
    if (itRes.ok) {
      const its: any[] = await itRes.json();
      items = its.map((i) => ({ name: i.product_name, qty: Number(i.quantity) || 0 }));
    }

    // venue (same D-5 fallback chain as the dispatch map: first active with coords)
    let venue: { lat: number; lng: number } | null = null;
    const locRes = await fetch(`${s.url}/rest/v1/locations?is_active=eq.true&select=latitude,longitude&limit=10`, { headers: s.headers });
    if (locRes.ok) {
      const locs: any[] = await locRes.json();
      const v = locs.find((l) => l.latitude != null && l.longitude != null);
      if (v) venue = { lat: Number(v.latitude), lng: Number(v.longitude) };
    }

    // road route (cached)
    let route: { geometry: [number, number][] | null; km: number; minutes: number } | null = null;
    if (venue && o.customer_lat != null && o.customer_lng != null) {
      const key = `${venue.lat.toFixed(5)},${venue.lng.toFixed(5)}→${Number(o.customer_lat).toFixed(5)},${Number(o.customer_lng).toFixed(5)}`;
      const hit = ROUTE_MEMO.get(key);
      if (hit && Date.now() - hit.t < 6 * 3600_000) {
        route = { geometry: hit.geometry, km: hit.km, minutes: hit.minutes };
      } else {
        const r = await osrmRoute(venue.lng, venue.lat, Number(o.customer_lng), Number(o.customer_lat));
        route = r ? { geometry: r.geometry, km: r.km, minutes: r.minutes } : null;
        if (r) ROUTE_MEMO.set(key, { geometry: r.geometry, km: r.km, minutes: r.minutes, t: Date.now() });
      }
    }

    // last known courier ping (seeds the smooth marker before the first
    // realtime event lands — the page also re-feeds it on every 5 s poll)
    let courierLast: { lat: number; lng: number; t: string } | null = null;
    if (o.courier_id) {
      const plRes = await fetch(`${s.url}/rest/v1/courier_location?courier_id=eq.${o.courier_id}&select=lat,lng,t`, { headers: s.headers });
      if (plRes.ok) {
        const pl: any[] = await plRes.json();
        if (pl[0]) courierLast = { lat: Number(pl[0].lat), lng: Number(pl[0].lng), t: pl[0].t };
      }
    }

    return NextResponse.json({
      order_number: o.order_number,
      delivery_status: o.delivery_status || 'pending',
      status_label: STATUS_AZ[o.delivery_status] || STATUS_AZ.pending,
      status: o.status || null,
      items,
      total: Number(o.total_amount) || 0,
      customer: o.customer_lat != null && o.customer_lng != null ? { lat: Number(o.customer_lat), lng: Number(o.customer_lng) } : null,
      venue,
      route,
      courier: o.courier_id ? { id: o.courier_id, name: o.courier_name || null } : null,
      courier_last: courierLast,
      delivered_at: o.delivered_at || null,
      eta_minutes: o.estimated_delivery_time ? Math.max(0, Math.ceil((new Date(o.estimated_delivery_time).getTime() - Date.now()) / 60_000)) : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
