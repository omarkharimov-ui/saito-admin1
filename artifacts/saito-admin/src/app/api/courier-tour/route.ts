import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';
import { osrmTable, nearestNeighborOrder } from '../lib/osrm';
import { nominatimOnce } from '../geocode/route';

// ============================================================================
// 2026-10-01 (11w-E, owner: "daha da yaxşı — kurye turları"): MULTI-STOP
// COURIER TOUR. Pick N active delivery orders → ONE optimized route.
//
// Mechanism (free, keyless):
//   1. ONE OSRM /table call = all-pairs driving matrix (venue + stops).
//   2. Nearest-neighbor ordering from the venue (deterministic, O(n²),
//      ≤12 stops — what a courier actually drives).
//   3. Per-stop leg km/minutes + cumulative totals.
//
// This is what competitors charge a separate dispatch product for; here it
// is a button on the delivery list.
// ============================================================================

const tourCache = new Map<string, { t: number; body: any }>();
const MAX_STOPS = 12;

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const body: any = await req.json();
    const rawPoints: any[] = Array.isArray(body?.points) ? body.points : [];
    const points = rawPoints
      .slice(0, MAX_STOPS)
      .map((p: any) => ({
        id: String(p?.id || ''),
        name: String(p?.name || '').slice(0, 120),
        lat: Number(p?.lat),
        lng: Number(p?.lng),
      }))
      .filter((p: { id: string; name: string; lat: number; lng: number }) =>
        Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
    if (points.length < 1) {
      return NextResponse.json({ error: 'Sifariş seçin' }, { status: 400 });
    }

    // Venue — same context rule as the other geo routes (11u: persisted DB read).
    const supabase = await createAuthClient();
    let loc: any = null;
    try {
      const opLoc = await resolveWriteLocationContext(auth.user!.id);
      if (opLoc?.locationId) {
        const { data } = await supabase
          .from('locations')
          .select('id, address, latitude, longitude')
          .eq('id', opLoc.locationId)
          .maybeSingle();
        loc = data || null;
      }
    } catch { /* fall through */ }
    if (!loc || loc.latitude == null || loc.longitude == null) {
      const { data: rows } = await supabase
        .from('locations')
        .select('id, address, latitude, longitude')
        .eq('is_active', true)
        .limit(10);
      loc = (rows || []).find((r: any) => r.latitude != null && r.longitude != null)
        || (rows || [])[0]
        || null;
    }
    let vLat: number | null = loc?.latitude != null ? Number(loc.latitude) : null;
    let vLng: number | null = loc?.longitude != null ? Number(loc.longitude) : null;
    if ((vLat == null || vLng == null) && loc?.address) {
      const hit = await nominatimOnce(String(loc.address).replace(/\s+/g, ' ').trim());
      if (hit) { vLat = hit.lat; vLng = hit.lng; }
    }
    if (vLat == null || vLng == null) {
      return NextResponse.json({ error: 'Məkan koordinatı yoxdur', status: 'venue_missing' }, { status: 422 });
    }

    // Cache: 2 min per (venue + rounded stop set) — re-clicks are instant.
    const ckey = `${vLat.toFixed(3)},${vLng.toFixed(3)}|` +
      points.map((p: { lat: number; lng: number }) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).sort().join(';');
    const hit0 = tourCache.get(ckey);
    if (hit0 && Date.now() - hit0.t < 120_000) return NextResponse.json(hit0.body);

    // One all-pairs matrix call: row 0 = venue.
    const all = [{ lat: vLat, lng: vLng }, ...points];
    const matrix = await osrmTable(all);
    if (!matrix || !matrix.dist) {
      return NextResponse.json({ error: 'tour_unavailable' }, { status: 502 });
    }

    const order = nearestNeighborOrder(matrix.dist);
    const stops: { id: string; name: string; leg_km: number; leg_min: number; cum_km: number; cum_min: number }[] = [];
    let cumKm = 0;
    let cumMin = 0;
    for (let i = 1; i < order.length; i++) {
      const prev = order[i - 1];
      const cur = order[i];
      const legKm = Math.round(((matrix.dist[prev]?.[cur] ?? 0) / 1000) * 10) / 10;
      const legMin = Math.max(1, Math.ceil((matrix.dur[prev]?.[cur] ?? 0) / 60));
      cumKm = Math.round((cumKm + legKm) * 10) / 10;
      cumMin += legMin;
      stops.push({ id: points[cur - 1].id, name: points[cur - 1].name, leg_km: legKm, leg_min: legMin, cum_km: cumKm, cum_min: cumMin });
    }
    const result = {
      stops,
      total_km: cumKm,
      total_min: cumMin,
      venue: { lat: vLat, lng: vLng },
    };
    tourCache.set(ckey, { t: Date.now(), body: result });
    if (tourCache.size > 50) tourCache.delete(tourCache.keys().next().value as string);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
