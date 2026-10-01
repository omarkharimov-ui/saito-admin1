import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';
import { nominatimOnce } from '../geocode/route';

// ============================================================================
// 2026-10-01 (11v, owner: "onlardan daha yaxşı olsun — free API tap"):
// LIVE DRIVING TIME for a delivery address. Competitors (Toast/Square/
// Lightspeed) show a STATIC zone ETA ("20–30 dəq"); this endpoint computes
// the REAL venue→customer driving route with OSRM (Open Source Routing
// Machine) — FREE, NO API KEY, no account.
//
// Data: OSRM public demo (router.project-osrm.org, OSRM driving profile).
//   Dev/single-POS volume is well inside their fair-use; for heavy prod use
//   self-host OSRM (docker, one line) — the URL is the only thing to change.
// Discipline: 6 s timeout, 5-min in-process cache per 100 m grid, graceful
// 502 (client keeps the km, hides the minutes — the ETA is an ENHANCEMENT,
// never a blocker).
// ============================================================================

import { osrmRoute } from '../lib/osrm';

const etaCache = new Map<string, { t: number; km: number; minutes: number }>();

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const lat = Number(req.nextUrl.searchParams.get('lat'));
    const lng = Number(req.nextUrl.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: 'Bad coords' }, { status: 400 });
    }

    // Venue point — same context rule as /api/geocode + /api/geocode/suggest
    // (operator location → active fallback → one-shot address bootstrap).
    // Since 11u the venue coords are persisted in the DB, so this is a plain
    // DB read in practice.
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

    const key = `${Math.round(vLat * 100)},${Math.round(vLng * 100)}|${Math.round(lat * 100)},${Math.round(lng * 100)}`;
    const cached = etaCache.get(key);
    if (cached && Date.now() - cached.t < 300_000) {
      return NextResponse.json({ km: cached.km, minutes: cached.minutes });
    }

    // 11w: shared OSRM helper (same route math as /api/geocode + /api/courier-tour).
    const route = await osrmRoute(vLng, vLat, lng, lat);
    if (!route) return NextResponse.json({ error: 'eta_unavailable' }, { status: 502 });

    etaCache.set(key, { t: Date.now(), ...route });
    if (etaCache.size > 200) etaCache.delete(etaCache.keys().next().value as string);
    return NextResponse.json(route);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
