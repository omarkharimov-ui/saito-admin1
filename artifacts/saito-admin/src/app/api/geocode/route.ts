import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';

// ============================================================================
// 2026-09-26 (owner, Task 55): address → km for the delivery fee engine.
//
// Owner: "unvan daxil edende hesablasın km gedən yolu, sonra real qiymet
// desin; hardcoded olmasin, çox dinamik olsun".
//
// GET /api/geocode?address=<customer address>
//   → { km, venue_lat, venue_lng, customer_lat, customer_lng, display, precision }
//
// Mechanism (no API key, no hardcoded coordinates):
//   1. Venue coords: the OPERATOR'S location (resolveWriteLocationContext —
//      same D-5 resolution as /api/settings/delivery) → locations.lat/lng.
//      If NULL, geocode the venue ADDRESS and persist (self-bootstrap).
//      Placeholder addresses ("Default location") are never used.
//   2. Customer: Nominatim search of the typed address.
//   3. km = haversine(venue → customer), rounded to 0.1.
//
// Nominatim reality (verified 2026-09-26): OSM street data for Baku is
// spotty — "Nizami Cəfərov 12, Bakı" → [] but "Nizami 12, Baku" → hit, and
// "Baku" → city. So we geocode with a PROGRESSIVE CANDIDATE CHAIN:
//   full address → comma suffixes → single parts (longest first).
// The first hit wins; precision tells the UI whether it is a street-level
// match or an area/city-level estimate (the UI shows "≈" either way).
//
// Rate discipline (Nominatim Usage Policy): per-address 15s cache + a
// simple in-process token bucket (~2 req/s). The client debounces 1.2s.
// ============================================================================

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'SaitoPOS/1.0 (delivery fee distance estimate; single-venue restaurant)';

// ── tiny in-process caches ─────────────────────────────────────────────────
const geoCache = new Map<string, { t: number; lat: number; lng: number; display: string; precision: 'address' | 'area' }>();
let lastCall = 0;

// Azerbaijani Latin → ASCII (Nominatim matches OSM names better in ASCII).
const AZ_TO_ASCII: Record<string, string> = {
  'ə': 'e', 'Ä': 'e', 'ä': 'e', 'ı': 'i', 'İ': 'i',
  'ç': 'c', 'Ç': 'C', 'ö': 'o', 'Ö': 'O', 'ü': 'u', 'Ü': 'U',
  'ş': 's', 'Ş': 'S', 'ğ': 'g', 'Ğ': 'G', 'Ə': 'E',
};
function transliterate(q: string): string {
  return q
    .replace(/[əäıİçöüşğƏÄÇÖÜŞĞ]/g, ch => AZ_TO_ASCII[ch] || ch)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Progressive candidate chain for a comma-separated address.
 * ["Nizami Cefrov 12", "Baku"] →
 *   "Nizami Cefrov 12, Baku" → "Baku" → "Nizami Cefrov 12"
 * (full → left-to-right suffixes → single parts, longest first, deduped).
 */
function candidates(q: string): { text: string; precision: 'address' | 'area' }[] {
  const parts = q.split(',').map(p => transliterate(p)).map(p => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: { text: string; precision: 'address' | 'area' }[] = [];
  const push = (text: string, precision: 'address' | 'area') => {
    const key = text.toLowerCase();
    if (!text || seen.has(key) || text.length < 3) return;
    seen.add(key);
    out.push({ text, precision });
  };
  const full = parts.join(', ');
  push(full, 'address');
  for (let i = 1; i < parts.length; i++) push(parts.slice(i).join(', '), 'area');
  const singles = [...parts].sort((a, b) => b.length - a.length);
  for (const s of singles) push(s, 'area');
  return out.slice(0, 5); // hard cap: max 5 Nominatim calls per address
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function nominatimOnce(q: string): Promise<{ lat: number; lng: number; display: string } | null> {
  const key = q.trim().toLowerCase();
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
    return { lat, lng, display: r.display_name || q };
  } catch {
    return null;
  }
}

async function nominatim(q: string): Promise<{ lat: number; lng: number; display: string; precision: 'address' | 'area' } | null> {
  for (const c of candidates(q)) {
    const hit = geoCache.get(c.text.trim().toLowerCase());
    if (hit && Date.now() - hit.t < 15_000) return { lat: hit.lat, lng: hit.lng, display: hit.display, precision: hit.precision };
    const r = await nominatimOnce(c.text);
    if (r) {
      geoCache.set(c.text.trim().toLowerCase(), { t: Date.now(), lat: r.lat, lng: r.lng, display: r.display, precision: c.precision });
      if (geoCache.size > 200) geoCache.delete(geoCache.keys().next().value as string);
      return { ...r, precision: c.precision };
    }
  }
  return null;
}

const PLACEHOLDER_ADDRESSES = new Set(['', 'default location', 'n/a', '-']);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const q = (request.nextUrl.searchParams.get('address') || '').trim();
    if (q.length < 6) {
      return NextResponse.json({ error: 'Ünvan çox qısadır (min 6 simvol)' }, { status: 400 });
    }

    const supabase = await createAuthClient();

    // ── 1) venue coords — OPERATOR location first (D-5, same as settings) ──
    // 2026-09-26 (verify55): the old `.limit(1)` picked "Main Location"
    // (address = "Default location" placeholder) → Nominatim 502.
    let loc: any = null;
    try {
      const opLoc = await resolveWriteLocationContext(auth.user!.id);
      if (opLoc?.locationId) {
        const { data } = await supabase
          .from('locations')
          .select('id, name, address, latitude, longitude')
          .eq('id', opLoc.locationId)
          .maybeSingle();
        loc = data || null;
      }
    } catch { /* fall through to any active location */ }

    if (!loc || (PLACEHOLDER_ADDRESSES.has(((loc.address as string) || '').trim().toLowerCase()) && (loc.latitude == null || loc.longitude == null))) {
      const { data: rows } = await supabase
        .from('locations')
        .select('id, name, address, latitude, longitude')
        .eq('is_active', true)
        .limit(10);
      // prefer a real (non-placeholder) address; a pre-geocoded lat/lng wins.
      loc = (rows || []).find((r: any) => r.latitude != null && r.longitude != null)
        || (rows || []).find((r: any) => !PLACEHOLDER_ADDRESSES.has(((r.address as string) || '').trim().toLowerCase()))
        || (rows || [])[0]
        || null;
    }
    if (!loc) return NextResponse.json({ error: 'Aktiv məkan tapılmadı' }, { status: 404 });

    let vLat: number | null = loc.latitude != null ? Number(loc.latitude) : null;
    let vLng: number | null = loc.longitude != null ? Number(loc.longitude) : null;
    if (vLat == null || vLng == null || !Number.isFinite(vLat) || !Number.isFinite(vLng)) {
      if (!loc.address || PLACEHOLDER_ADDRESSES.has((loc.address as string).trim().toLowerCase())) {
        return NextResponse.json({
          error: 'Məkan koordinatı və ünvanı yoxdur — Ayarlar → Çatdırılma-da ünvan təyin edin',
          status: 'venue_missing',
        } as any, { status: 422 });
      }
      const v = await nominatim(loc.address as string);
      if (!v) return NextResponse.json({ error: 'Məkan ünvanı geocode edilmədi (Nominatim)' }, { status: 502 });
      vLat = v.lat; vLng = v.lng;
      // Persist ONLY street-level matches. A city/area fallback (street not
      // in OSM) must not be locked in — otherwise the venue is stuck at the
      // city centroid forever and every km estimate drifts by several km.
      if (v.precision === 'address') {
        try {
          await supabase.from('locations').update({ latitude: vLat, longitude: vLng }).eq('id', loc.id);
        } catch { /* RLS may deny — non-fatal, re-geocodes next time */ }
      }
    }

    // ── 2) customer point (progressive chain: street → area → city) ────────
    const c = await nominatim(q);
    if (!c) return NextResponse.json({ error: 'Ünvan tapılmadı — manual KM istifadə edin' }, { status: 404 });

    // ── 3) distance ────────────────────────────────────────────────────────
    const km = Math.round(haversineKm(vLat, vLng!, c.lat, c.lng) * 10) / 10;
    return NextResponse.json({
      km,
      venue_lat: vLat,
      venue_lng: vLng,
      customer_lat: c.lat,
      customer_lng: c.lng,
      display: c.display,
      precision: c.precision,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Geocode xətası' }, { status: 500 });
  }
}
