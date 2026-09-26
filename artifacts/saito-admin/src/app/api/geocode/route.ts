import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// ============================================================================
// 2026-09-26 (owner, Task 55): address → km for the delivery fee engine.
//
// Owner: "unvan daxil edende hesablasın km gedən yolu, sonra real qiymət
// desin; hardcoded olmasin, çox dinamik olsun".
//
// GET /api/geocode?address=<venue|customer address>
//   → { km, venue_lat, venue_lng, customer_lat, customer_lng, display }
//
// Mechanism (no API key, no hardcoded coordinates):
//   1. Venue coords: locations.latitude/longitude — if NULL, geocode the
//      venue ADDRESS (Nominatim) and persist (self-bootstrap, one-time).
//   2. Customer: Nominatim search of the typed address.
//   3. km = haversine(venue → customer), rounded to 0.1.
//
// Rate discipline (Nominatim Usage Policy): per-address 15s cache + a
// simple in-process token bucket (~2 req/s). The client debounces 1.2s.
// ============================================================================

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'SaitoPOS/1.0 (delivery fee distance estimate; single-venue restaurant)';

// ── tiny in-process caches ─────────────────────────────────────────────────
const geoCache = new Map<string, { t: number; lat: number; lng: number; display: string }>();
let lastCall = 0;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function nominatim(q: string): Promise<{ lat: number; lng: number; display: string } | null> {
  const key = q.trim().toLowerCase();
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.t < 15_000) return { lat: hit.lat, lng: hit.lng, display: hit.display };
  // token bucket: min 550ms between Nominatim calls
  const wait = 550 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const url = `${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return null;
    const rows = await res.json();
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) return null;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const out = { lat, lng, display: r.display_name || q };
    geoCache.set(key, { t: Date.now(), lat, lng, display: out.display });
    if (geoCache.size > 200) geoCache.delete(geoCache.keys().next().value as string);
    return out;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const q = (request.nextUrl.searchParams.get('address') || '').trim();
    if (q.length < 6) {
      return NextResponse.json({ error: 'Ünvan çox qısadır (min 6 simvol)' }, { status: 400 });
    }

    const supabase = await createAuthClient();

    // ── 1) venue coords (self-bootstrap from the venue address) ─────────────
    const { data: locRows } = await supabase.from('locations').select('id, latitude, longitude, address, name').eq('is_active', true).limit(1);
    const loc = (locRows || [])[0];
    if (!loc) return NextResponse.json({ error: 'Aktiv məkan tapılmadı' }, { status: 404 });

    let vLat: number | null = loc.latitude != null ? Number(loc.latitude) : null;
    let vLng: number | null = loc.longitude != null ? Number(loc.longitude) : null;
    if (vLat == null || vLng == null || !Number.isFinite(vLat) || !Number.isFinite(vLng)) {
      if (!loc.address) {
        return NextResponse.json({
          error: 'Məkan koordinatı və ünvanı yoxdur — Ayarlar → Məkan-da lat/lng təyin edin',
          status: 'venue_missing',
        } as any, { status: 422 });
      }
      const v = await nominatim(loc.address);
      if (!v) return NextResponse.json({ error: 'Məkan ünvanı geocode edilmədi (Nominatim)' }, { status: 502 });
      vLat = v.lat; vLng = v.lng;
      // persist for future calls (one-time bootstrap)
      try {
        await supabase.from('locations').update({ latitude: vLat, longitude: vLng }).eq('id', loc.id);
      } catch { /* RLS may deny — non-fatal, re-geocodes next time */ }
    }

    // ── 2) customer point ───────────────────────────────────────────────────
    const c = await nominatim(q);
    if (!c) return NextResponse.json({ error: 'Ünvan tapılmadı — manual KM istifadə edin' }, { status: 404 });

    // ── 3) distance ─────────────────────────────────────────────────────────
    const km = Math.round(haversineKm(vLat, vLng!, c.lat, c.lng) * 10) / 10;
    return NextResponse.json({
      km,
      venue_lat: vLat,
      venue_lng: vLng,
      customer_lat: c.lat,
      customer_lng: c.lng,
      display: c.display,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Geocode xətası' }, { status: 500 });
  }
}
