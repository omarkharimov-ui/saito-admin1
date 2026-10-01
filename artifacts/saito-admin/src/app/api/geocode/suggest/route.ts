import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';
// Shared with /api/geocode (same process, same IP — one Nominatim policy):
// the venue bootstrap must produce the SAME point as the geocode route.
import { transliterate, candidates, haversineKm, nominatimOnce } from '../route';

// ============================================================================
// 2026-10-01 (11t, owner): GOOGLE-MAPS-STYLE ADDRESS SUGGEST.
// "20 yanvar" → Nominatim returns ALL 20 Yanvar streets (with districts in
// display_name) → operator picks the exact one → exact point + KM. The old
// single best-match geocode picked a district arbitrarily — owner:
// "google maps kimi davrananda olmaz??"
// Nominatim: free, no key, 1 req/s policy (token bucket), countrycodes=az,
// limit=7, 10s in-process cache, max 2 calls per query (raw + variant).
// ============================================================================

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'SaitoPOS/1.0 (Baku restaurant POS; contact: saito-pos)';

// 60s venue-point cache (suggest fires per keystroke-debounce; the address
// bootstrap is a Nominatim chain we must not repeat per keystroke).
const venuePointCache = new Map<string, { t: number; lat: number; lng: number }>();

// Token bucket — 1 req/s to Nominatim (their usage policy), 550ms fill.
// (nominatimOnce imported from ../route has its own bucket for the
// venue-bootstrap chain — both stay within the shared IP policy.)
let bucketTokens = 1.0;
let bucketLast = Date.now();
async function throttledFetch(url: string): Promise<Response | null> {
  for (let i = 0; i < 6; i++) {
    const now = Date.now();
    bucketTokens = Math.min(1.0, bucketTokens + (now - bucketLast) / 550);
    bucketLast = now;
    if (bucketTokens >= 1.0) {
      bucketTokens -= 1.0;
      try { return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); }
      catch { return null; }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

// 10s in-process cache (client debounces 600ms; repeats hit this).
const sugCache = new Map<string, { t: number; results: SuggestItem[] }>();

export interface SuggestItem {
  name: string;   // display_name (accept-language=az), "… , Azərbaycan" stripped
  lat: number;
  lng: number;
  km: number;     // haversine venue→point, 0.1 rounded (display only; zone = operator's call)
  type: string;   // addresstype/type (street|building|house|…)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const address = (req.nextUrl.searchParams.get('address') || '').trim();
    if (address.length < 3) return NextResponse.json({ results: [] });

    // Venue point for per-result KM — mirrors /api/geocode EXACTLY (same
    // helpers, same candidate chain) so suggest KM == geocode KM:
    // operator location (D-5) → active fallback → address bootstrap.
    const supabase = await createAuthClient();
    const PLACEHOLDER_ADDRESSES = new Set(['', 'default location', 'n/a', '-']);
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
    } catch { /* fall through */ }
    if (!loc || (PLACEHOLDER_ADDRESSES.has(((loc.address as string) || '').trim().toLowerCase()) && (loc.latitude == null || loc.longitude == null))) {
      const { data: rows } = await supabase
        .from('locations')
        .select('id, name, address, latitude, longitude')
        .eq('is_active', true)
        .limit(10);
      loc = (rows || []).find((r: any) => r.latitude != null && r.longitude != null)
        || (rows || []).find((r: any) => !PLACEHOLDER_ADDRESSES.has(((r.address as string) || '').trim().toLowerCase()))
        || (rows || [])[0]
        || null;
    }
    if (!loc) return NextResponse.json({ error: 'Aktiv məkan tapılmadı' }, { status: 404 });

    let vLat: number | null = loc.latitude != null ? Number(loc.latitude) : null;
    let vLng: number | null = loc.longitude != null ? Number(loc.longitude) : null;
    if (vLat == null || vLng == null || !Number.isFinite(vLat) || !Number.isFinite(vLng)) {
      const vc = venuePointCache.get(loc.id);
      if (vc && Date.now() - vc.t < 60_000) {
        vLat = vc.lat; vLng = vc.lng;
      } else if (!loc.address || PLACEHOLDER_ADDRESSES.has((loc.address as string).trim().toLowerCase())) {
        return NextResponse.json({ error: 'Məkan koordinatı və ünvanı yoxdur', status: 'venue_missing' }, { status: 422 });
      } else {
        // Bootstrap: geocode the venue address with the SAME chain as /api/geocode
        // (60s cache — suggest fires per keystroke-debounce; no repeat chains).
        let hit: { lat: number; lng: number } | null = null;
        for (const c of candidates(loc.address.replace(/\s+/g, ' ').trim())) {
          hit = await nominatimOnce(c.text);
          if (hit) break;
        }
        if (!hit) return NextResponse.json({ error: 'Məkan ünvanı geocode edilmədi (Nominatim)' }, { status: 502 });
        vLat = hit.lat; vLng = hit.lng;
        venuePointCache.set(loc.id, { t: Date.now(), lat: vLat, lng: vLng });
        if (venuePointCache.size > 10) venuePointCache.delete(venuePointCache.keys().next().value as string);
      }
    }

    const key = transliterate(address).toLowerCase();
    const cached = sugCache.get(key);
    if (cached && Date.now() - cached.t < 10_000) {
      return NextResponse.json({ results: cached.results, venue: { lat: vLat, lng: vLng } });
    }

    const q = (s: string) =>
      `${NOMINATIM}?format=jsonv2&limit=7&countrycodes=az&accept-language=az&q=${encodeURIComponent(s)}`;

    const raw = address.replace(/\s+/g, ' ');
    let rows: any[] = [];
    const r = await throttledFetch(q(raw));
    if (r?.ok) rows = await r.json();

    // Variant fallback: the input's other script (AZ chars ↔ ASCII) may match
    // OSM tags better — one extra call, only when the first was weak.
    const ascii = transliterate(raw);
    if (rows.length < 2 && ascii !== raw) {
      const r2 = await throttledFetch(q(ascii));
      if (r2?.ok) {
        const rows2: any[] = await r2.json();
        if (rows2.length > rows.length) rows = rows2;
      }
    }

    // Dedup: one street often has several OSM ways 100-500m apart that render
    // as identical list rows ("20 Yanvar …, 1102" vs "… 1134"). Merge by
    // name (postal suffix stripped) + ~1 km grid — different cities with the
    // same street name stay separate.
    const rawItems: SuggestItem[] = rows
      .filter(x => x.lat != null && x.lon != null)
      .map(x => ({
        name: (x.display_name || x.name || '').replace(/,?\s*Azərbaycan$/i, '').trim(),
        lat: Number(x.lat),
        lng: Number(x.lon),
        km: Math.round(haversineKm(vLat, vLng, Number(x.lat), Number(x.lon)) * 10) / 10,
        type: x.addresstype || x.type || '',
      }));
    const seenDedup = new Set<string>();
    const results: SuggestItem[] = [];
    for (const it of rawItems) {
      const key = `${it.name.replace(/,\s*\d{3,4}$/, '').toLowerCase()}|${Math.round(it.lat * 100)}|${Math.round(it.lng * 100)}`;
      if (seenDedup.has(key)) continue;
      seenDedup.add(key);
      results.push(it);
      if (results.length >= 7) break;
    }

    sugCache.set(key, { t: Date.now(), results });
    if (sugCache.size > 100) sugCache.delete(sugCache.keys().next().value as string);
    return NextResponse.json({ results, venue: { lat: vLat, lng: vLng } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
