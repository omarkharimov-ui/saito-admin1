import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';
// Shared with /api/geocode (same process, same IP — one Nominatim policy):
// the venue bootstrap must produce the SAME point as the geocode route.
import { transliterate, candidates, haversineKm, nominatimOnce, detectPlace, venueCityOf, normalizeOrdinal, microCandidates, cityPoint } from '../route';
// 11y: local gazetteer helpers moved to ../lib/gazetteer (shared with
// /api/geocode's offline fallback — one index, one behavior, no cycles).
import { localPrefix, localFuzzy } from '../../lib/gazetteer';

export interface SuggestArea { name: string; lat: number; lng: number }

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

// Token bucket — 1 req/s to Nominatim (their usage policy).
// 11x (E2E catch: repeated 429s under today's load): the old 550ms fill =
// up to 1.8 req/s — ABOVE their policy; the CDN then throttles the whole
// IP for minutes. 1100ms fill = strictly <1 req/s.
let bucketTokens = 1.0;
let bucketLast = Date.now();
async function throttledFetch(url: string): Promise<Response | null> {
  for (let i = 0; i < 6; i++) {
    const now = Date.now();
    bucketTokens = Math.min(1.0, bucketTokens + (now - bucketLast) / 1100);
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
// 11x: the city FOCUS (map zoom target) is cached with the results.
const sugCache = new Map<string, { t: number; results: SuggestItem[]; area: SuggestArea | null }>();

export interface SuggestItem {
  name: string;   // display_name (accept-language=az), "… , Azərbaycan" stripped
  lat: number;
  lng: number;
  km: number;     // haversine venue→point, 0.1 rounded (display only; zone = operator's call)
  type: string;   // addresstype/type (street|building|house|…)
}

// ── 11u/11w-D/11y: LOCAL STREET GAZETTEER — see ../lib/gazetteer.ts ────────
// (1124 streets, Bakı+Sumqayıt; localPrefix + Levenshtein localFuzzy — zero
// Nominatim calls; shared with /api/geocode's offline fallback.)

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const address = (req.nextUrl.searchParams.get('address') || '').trim();
    if (address.length < 1) return NextResponse.json({ results: [] });

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

    // 11u: 1-2 chars → LOCAL ONLY (no Nominatim at all) → instant dropdown
    // from the very first keystroke. localPrefix is an O(1124) in-memory
    // startsWith scan — no cache needed. Closest-first (Google-Maps-style).
    if (address.length < 3) {
      const local = localPrefix(address, vLat, vLng, 8).sort((a, b) => a.km - b.km);
      return NextResponse.json({ results: local, venue: { lat: vLat, lng: vLng } });
    }

    const key = transliterate(address).toLowerCase();
    const cached = sugCache.get(key);
    if (cached && Date.now() - cached.t < 10_000) {
      return NextResponse.json({ results: cached.results, venue: { lat: vLat, lng: vLng }, area: cached.area });
    }

    const q = (s: string) =>
      `${NOMINATIM}?format=jsonv2&limit=7&countrycodes=az&accept-language=az&q=${encodeURIComponent(s)}`;

    // 11x: "9cu" → "9-cü" (OSM AZ ordinal tags) — "bravo sumqayit 9cu
    // mikrorayon" must reach Nominatim as "9-cü mikrorayon".
    const raw = normalizeOrdinal(address.replace(/\s+/g, ' '));
    let rows: any[] = [];
    // 11w-D: HOUSE NUMBER — "nizami 27", "sumqayit niyazi 27A". Nominatim
    // resolves building numbers best in a CITY-QUALIFIED query ("Nizami 27,
    // Bakı"), so call 1 = street+number+city (the typed city if present, else
    // the venue's own city — reverse-geocoded, in-process cached), call 2 =
    // the raw string. No trailing number → the 11v candidate-driven chain.
    const houseM = raw.match(/^(.{3,}?)\s+(\d{1,4}[a-zа-яa-z]?)$/i);
    let chain: string[];
    let callCap = 2;
    if (houseM) {
      const dp = detectPlace(raw);
      const city = dp?.city ?? (await venueCityOf(vLat, vLng));
      if (dp?.restAZ && city) chain = [`${dp.restAZ}, ${city}`, raw];
      else if (city) chain = [`${raw}, ${city}`];
      else chain = [raw];
    } else {
      // 11v (owner E2E: "20 yanvar berde" → 0 rows): CANDIDATE-DRIVEN, like
      // /api/geocode — raw string first, then the smart decomposition
      // ("20 yanvar berde" → "20 yanvar, Bərdə"; Nominatim free-text fails on
      // comma-less "street city"), plus the other script as a last resort.
      const cs = candidates(raw).map(c => c.text);
      const ascii = transliterate(raw);
      if (ascii !== raw && !cs.includes(ascii)) cs.push(ascii);
      // 11x: MICRO-DISTRICT — "bravo sumqayit 9cu mikrorayon": the TARGETED
      // pairs ("9-cü mikrorayon, Sumqayıt" + "Bravo, Sumqayıt") hit OSM far
      // better than the whole phrase → they go first, the phrase last.
      const micro = microCandidates(raw, detectPlace(raw)?.city ?? null);
      if (micro.length) {
        // Both scripts: Nominatim's exact layer is finicky about AZ vs ASCII
        // city spellings ("Sumqayıt" vs "Sumqayit") — the ordinal candidate
        // in each script is the valuable hit.
        const microAlt = micro.map(m => transliterate(m)).filter(a => !micro.includes(a));
        chain = [...micro, ...microAlt].slice(0, 3);
        callCap = 3;
      } else {
        chain = cs;
      }
    }
    for (const cq of chain.slice(0, callCap)) {
      if (rows.length >= 2) break;
      const r = await throttledFetch(q(cq));
      if (r?.ok) {
        // 11x fix: CONCAT, not replace — an earlier candidate's hit must not
        // be clobbered by a later candidate (mikrorayon row was lost to the
        // "Bravo supermarket" row under the old assignment).
        const next = await r.json();
        rows = Array.isArray(next) ? rows.concat(next) : next;
      }
    }

    // Dedup: one street often has several OSM ways 100-500m apart that render
    // as identical list rows ("20 Yanvar …, 1102" vs "… 1134"). Merge by
    // name (postal suffix stripped) + ~1 km grid — different cities with the
    // same street name stay separate.
    // 11x (E2E catch): Nominatim can return EMPTY lat/lon strings —
    // Number("") === 0 → a (0,0) row 6734.9 km "away". Reject empty,
    // non-finite and null-island rows before mapping.
    const rawItems: SuggestItem[] = rows
      .filter(x => {
        const la = typeof x.lat === 'string' ? x.lat.trim() : x.lat;
        const lo = typeof x.lon === 'string' ? x.lon.trim() : x.lon;
        if (la == null || lo == null || la === '' || lo === '') return false;
        const lat = Number(la);
        const lng = Number(lo);
        return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
      })
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
      const dkey = `${it.name.replace(/,\s*\d{3,4}$/, '').toLowerCase()}|${Math.round(it.lat * 100)}|${Math.round(it.lng * 100)}`;
      if (seenDedup.has(dkey)) continue;
      seenDedup.add(dkey);
      results.push(it);
      if (results.length >= 7) break;
    }

    // 11u: merge local gazetteer prefix hits (streets Nominatim's free-text
    // ranks low / misses) — same dedup keying, cap 8 rows total.
    // 11w-D: + LEVENSHTEIN hits for typos ("nizamii") — still 0 Nominatim
    // calls, filled after the exact prefixes into the remaining slots.
    const localHits = localPrefix(address, vLat, vLng, 8);
    const skipN = new Set(localHits.map(it => it.name.split(', ')[0]));
    const localAll = [
      ...localHits,
      ...localFuzzy(address, vLat, vLng, Math.max(0, 8 - localHits.length), skipN),
    ];
    for (const it of localAll) {
      if (results.length >= 8) break;
      const dkey = `${it.name.replace(/,\s*\d{3,4}$/, '').toLowerCase()}|${Math.round(it.lat * 100)}|${Math.round(it.lng * 100)}`;
      if (seenDedup.has(dkey)) continue;
      seenDedup.add(dkey);
      results.push(it);
    }
    // 11u: closest-first — Nominatim free-text sometimes ranks far fuzzy
    // matches ("niz" → "Aşağı Gövhər ağa məscidi, Şuşa") above the real local
    // street 0.6 km away. Proximity order is what the operator needs (city is
    // still visible in every row name).
    results.sort((a, b) => a.km - b.km);

    // 11x (owner: "o mapda istediyin her sey var" — the map IS the search):
    // CITY FOCUS for the mini-map. When no exact point was picked, the map
    // zooms to the typed city (district level — street labels readable on
    // the OSM tiles) and the operator places the pin by eye. cost: at most
    // ONE Nominatim call per city per 24h (cityPoint cache).
    let area: SuggestArea | null = null;
    const cityName = detectPlace(raw)?.city ?? null;
    if (cityName) {
      try {
        const cp = await cityPoint(cityName);
        if (cp) area = { name: cityName, lat: cp.lat, lng: cp.lng };
      } catch { area = null; }
    }

    sugCache.set(key, { t: Date.now(), results, area });
    if (sugCache.size > 100) sugCache.delete(sugCache.keys().next().value as string);
    return NextResponse.json({ results, venue: { lat: vLat, lng: vLng }, area });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
