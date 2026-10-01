import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';
import { osrmRoute } from '../lib/osrm';
import { geoCacheGet, geoCacheSet } from '../lib/geo-cache';
import { localStreetPoint, localCityPoint } from '../lib/gazetteer';

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
const geoCache = new Map<string, { t: number; lat: number; lng: number; display: string; precision: 'address' | 'area'; type: string }>();
let lastCall = 0;

// Azerbaijani Latin → ASCII (Nominatim matches OSM names better in ASCII).
const AZ_TO_ASCII: Record<string, string> = {
  'ə': 'e', 'Ä': 'e', 'ä': 'e', 'ı': 'i', 'İ': 'i',
  'ç': 'c', 'Ç': 'C', 'ö': 'o', 'Ö': 'O', 'ü': 'u', 'Ü': 'U',
  'ş': 's', 'Ş': 'S', 'ğ': 'g', 'Ğ': 'G', 'Ə': 'E',
};
export function transliterate(q: string): string {
  return q
    .replace(/[əäıİçöüşğƏÄÇÖÜŞĞ]/g, ch => AZ_TO_ASCII[ch] || ch)
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 11x (owner: "bravo sumqayit 9cu mikrorayon anlaşılmır") ────────────────
// Digit-ordinal normalization: operators type micro-district numbers WITHOUT
// the hyphen/diacritic ("9cu", "2ci") but OSM AZ tags read "9-cü mikrorayon",
// "2-ci mikrorayon". "9cu" → "9-cü", "9ci" → "9-ci" (before any candidate
// chain, both in /api/geocode and /api/geocode/suggest).
export function normalizeOrdinal(q: string): string {
  return q.replace(/\b(\d+)\s*(cu|ci|cü)\b/gi, (m, num: string, suf: string) =>
    `${num}-${suf.toLowerCase() === 'cu' ? 'cü' : 'ci'}`,
  );
}

// Micro-district candidates ("bravo sumqayit 9cu mikrorayon" → OSM tags the
// district as "9-cü mikrorayon" and/or the neighborhood as "Bravo"). The
// generic chain sends the whole phrase, which Nominatim free-text misses;
// these TARGETED pairs (word+city, ordinal+city) are what OSM actually has.
export function microCandidates(cleaned: string, city: string | null | undefined): string[] {
  if (!/mikrorayon|massiv/i.test(cleaned)) return [];
  const tokens = cleaned.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const isCityTok = (t: string) =>
    !!city && (
      t === city
      || transliterate(t).toLowerCase() === transliterate(city).toLowerCase()
      || PLACE_LOOKUP.get(transliterate(t).toLowerCase()) === city
    );
  const ordTok = tokens.find(t => /^\d+(-[a-züıi]{0,2})?$/i.test(t));
  if (ordTok && city) out.push(`${ordTok} mikrorayon, ${city}`);
  const wordTok = tokens.find(t =>
    t.length >= 2
    && !/^\d/.test(t)
    && !/mikrorayon|massiv|k[üu]c|prospekt|bulvar|sokak/i.test(t)
    && !isCityTok(t),
  );
  if (wordTok && city) out.push(`${wordTok}, ${city}`);
  return out;
}

// ── 2026-10-01 (11s, owner): AZ place-name variant dictionary ───────────────
// Owner types addresses WITHOUT AZ characters (and in Russian-style
// spellings): "sumqayit niyazi 27A", "sumgait …", "baku nizami 12". The old
// chain only transliterated the whole string, so a comma-less street+city
// string had no city-level fallback and same-city (Bakı) street misses fell
// to km=0 → the client rejected it as "not found". Each entry maps every
// common spelling (ASCII-folded, lowercase) to the canonical OSM name (AZ
// script — what Nominatim's AZ tags actually match).
const AZ_PLACES: { name: string; variants: string[] }[] = [
  { name: 'Bakı', variants: ['baku', 'baki'] },
  { name: 'Sumqayıt', variants: ['sumqayit', 'sumgayt', 'sumgait'] },
  { name: 'Gəncə', variants: ['genca', 'gence', 'genje', 'ganja'] },
  { name: 'Mingəçevir', variants: ['mingechevir', 'mingecevir'] },
  { name: 'Xırdalar', variants: ['xirdalar', 'xirdalan'] },
  { name: 'Sabunçu', variants: ['sabunchu', 'sabunclu'] },
  { name: 'Salyan', variants: ['salyan', 'shalyan'] },
  { name: 'Şamaxı', variants: ['shamaki', 'shamaxi', 'shamahi'] },
  { name: 'Lənkəran', variants: ['lenkeran', 'lankaran'] },
  { name: 'Şəki', variants: ['sheki', 'shaki'] },
  { name: 'Quba', variants: ['quba', 'kuba'] },
  { name: 'Oğuz', variants: ['oguz'] },
  { name: 'İmişli', variants: ['imishli'] },
  { name: 'Yevlax', variants: ['yevlax', 'evlakh'] },
  { name: 'Astara', variants: ['astara'] },
  { name: 'Zaqatala', variants: ['zaqatala', 'zakatala'] },
  { name: 'Qusar', variants: ['qusar', 'kusar', 'qusal'] },
  { name: 'Qəbələ', variants: ['qabala', 'gabala', 'qebala'] },
  { name: 'Xaçmaz', variants: ['xacmaz', 'khachmaz'] },
  { name: 'Cəlilabad', variants: ['celilabad', 'jelilabad'] },
  { name: 'Ağdam', variants: ['agdam', 'aghdam'] },
  { name: 'Göygöl', variants: ['goygol'] },
  { name: 'Şabran', variants: ['shabran'] },
  { name: 'İsmayıllı', variants: ['ismayilli'] },
  { name: 'Masallı', variants: ['masalli'] },
  // 11v (owner E2E: "20 yanvar berde" → 0 rows — Bərdə missing): the rest of
  // the realistic delivery-range cities (all within ~400 km of the venue).
  { name: 'Bərdə', variants: ['berde', 'barda'] },
  { name: 'Neftçala', variants: ['neftcala', 'neftchala', 'nafchala'] },
  { name: 'Samux', variants: ['samux', 'samuch'] },
  { name: 'Şəmkir', variants: ['shamkir', 'shemkir'] },
  { name: 'Hacıqəbələ', variants: ['haciqebale', 'haciqabala'] },
  { name: 'Biləsuvar', variants: ['bilasuvar', 'bilasovar'] },
  { name: 'Qobustan', variants: ['qobustan', 'gobustan'] },
  { name: 'Ağcabədi', variants: ['agcabadi', 'agjabedi'] },
  { name: 'Gədəbəy', variants: ['gedabeq', 'gadabay'] },
  { name: 'Xızı', variants: ['xizi', 'khizi'] },
  { name: 'İsgəndərli', variants: ['isgendarli'] },
  { name: 'Lerik', variants: ['leric', 'lerix'] },
  { name: 'Tovuz', variants: ['tovuz'] },
  { name: 'Qax', variants: ['qax', 'kakh'] },
  { name: 'Naxçıvan', variants: ['naxcivan', 'nakhchivan'] },
];
const PLACE_LOOKUP = new Map<string, string>();
for (const p of AZ_PLACES) {
  // 11z (CRITICAL bug found in E2E): the folded CANONICAL name itself must be
  // in the map — the original list forgot same-script names ("Lerik" →
  // variants were only ['leric','lerix'], so typing "Lerik" matched NOTHING,
  // detectPlace returned null, the far-guard dropped to 120 km and a 215 km
  // hit was rejected → the anchor retry answered with the venue point, km 0).
  PLACE_LOOKUP.set(transliterate(p.name).toLowerCase(), p.name);
  for (const v of p.variants) PLACE_LOOKUP.set(v, p.name);
}

// 11z: tiny Levenshtein (capped) — fuzzy city-token detection in detectPlace.
// CAUTION (11z bug caught in test): breaking the INNER loop when
// rowMin > max and then using the PARTIAL row corrupts the next rows and can
// return a distance LOWER than the true one ("nizami" vs "xizi" reported 2
// instead of 3 → the street name "Nizami" was detected as city "Xızı"!).
// Correct early-exit: break the WHOLE computation at row end (row minima are
// non-decreasing across rows, so final > max is guaranteed).
function levAZ(a: string, b: string, mx: number): number {
  if (Math.abs(a.length - b.length) > mx) return mx + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    prev = cur;
    if (rowMin > mx) return mx + 1;
  }
  return prev[b.length];
}

/**
 * Find the place token (any position in the string) via the variant
 * dictionary. Returns the rest of the address in BOTH scripts (AZ original
 * and ASCII) so the candidate chain can try each against OSM's AZ / EN tags.
 */
export function detectPlace(azText: string): { city: string; restAZ: string; restASCII: string } | null {
  const azTokens = azText.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const asciiTokens = azTokens.map(t => transliterate(t).toLowerCase());
  for (let i = 0; i < asciiTokens.length; i++) {
    const city = PLACE_LOOKUP.get(asciiTokens[i]);
    if (city) {
      const restTokens = [...azTokens.slice(0, i), ...azTokens.slice(i + 1)];
      const restAZ = restTokens.join(' ').trim();
      return { city, restAZ, restASCII: transliterate(restAZ) };
    }
  }
  // 11z: FUZZY city token — operator typos of city names ("Isemayilli" →
  // İsmayıllı, lev 2). Without this the whole query falls into the
  // no-place-token path and the anchor retry answers with the venue point
  // (km 0) instead of the typed city. Tokens ≥ 5 chars only (short city names
  // like "qax"/"quba" must stay exact — "qaz" is not Qax); best single hit,
  // ≤ 2 edits, and it must beat exact-no-match by a real distance (1–2).
  let bestIdx = -1; let bestCity: string | null = null; let bestD = 3;
  for (let i = 0; i < asciiTokens.length; i++) {
    const t = asciiTokens[i];
    if (t.length < 5) continue;
    for (const [v, city] of PLACE_LOOKUP) {
      if (v.length < 4) continue;
      const d = levAZ(t, v, 2);
      if (d >= 1 && d < bestD) { bestD = d; bestIdx = i; bestCity = city; }
    }
  }
  if (bestIdx >= 0 && bestCity) {
    const restTokens = [...azTokens.slice(0, bestIdx), ...azTokens.slice(bestIdx + 1)];
    const restAZ = restTokens.join(' ').trim();
    return { city: bestCity, restAZ, restASCII: transliterate(restAZ) };
  }
  return null;
}

// Venue's own city (Nominatim reverse, in-process cached) — the anchor used
// when the customer's address names no place token at all.
let venueCityCache: { key: string; city: string | null } = { key: '', city: null };
// 11w: exported — /api/geocode/suggest uses it for house-number anchoring
// ("nizami 27" → "nizami, <venue city>").
export async function venueCityOf(vLat: number, vLng: number): Promise<string | null> {
  const key = `${vLat.toFixed(3)},${vLng.toFixed(3)}`;
  if (venueCityCache.key === key) return venueCityCache.city;
  let city: string | null = null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${vLat}&lon=${vLng}&zoom=10&accept-language=az`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    );
    if (res.ok) {
      const d: any = await res.json();
      const a = d?.address || {};
      city = a.city || a.town || a.municipality || a.county || a.state || null;
    }
  } catch { city = null; }
  venueCityCache = { key, city };
  return city;
}

/**
 * Progressive candidate chain (11s — owner: AZ xarakterlərsiz yazış da
 * tanınsın: "sumqayit niyazi 27A", "sumgait …", "baku nizami 12").
 * Order: original (AZ script) → rest+place (AZ) → full ASCII → rest+place
 * (ASCII) → place alone → comma suffixes → singles (longest first). BOTH
 * scripts are tried because OSM street names in AZ are tagged in AZ Latin
 * ("Nizami Cəfərov küçəsi") while some use EN/ASCII tags. `anchorCity`
 * (the venue's own city) is appended when the input names no place token.
 */
export function candidates(q: string, anchorCity?: string | null): { text: string; precision: 'address' | 'area' }[] {
  const cleaned = q.replace(/\s+/g, ' ').trim();
  const azParts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
  const fullAZ = azParts.join(', ');
  const asciiParts = azParts.map(p => transliterate(p)).filter(Boolean);
  const fullASCII = asciiParts.join(', ');
  const seen = new Set<string>();
  const out: { text: string; precision: 'address' | 'area' }[] = [];
  const push = (text: string, precision: 'address' | 'area') => {
    const key = transliterate(text).toLowerCase();
    if (!text || seen.has(key) || text.length < 3) return;
    seen.add(key);
    out.push({ text, precision });
  };
  const detected = detectPlace(cleaned);
  const cityOnly = !!detected && !detected.restAZ; // input is just the place name
  push(fullAZ, cityOnly ? 'area' : 'address');
  if (detected?.restAZ) push(`${detected.restAZ}, ${detected.city}`, 'address');
  push(fullASCII, cityOnly ? 'area' : 'address');
  if (detected?.restASCII) push(`${detected.restASCII}, ${transliterate(detected.city)}`, 'address');
  if (!detected && anchorCity) push(`${fullAZ}, ${anchorCity}`, 'address');
  if (detected) push(detected.city, 'area');
  // 11x: targeted micro-district candidates (before the singles — they are
  // far more likely to hit OSM than the whole phrase or a bare single).
  for (const m of microCandidates(cleaned, detected?.city ?? anchorCity ?? null)) push(m, 'area');
  for (let i = 1; i < asciiParts.length; i++) push(asciiParts.slice(i).join(', '), 'area');
  // 11z: the BARE anchor city (the venue's own point!) goes LAST among the
  // area candidates. The old position (before the comma suffixes) let a
  // typed-but-unrecognized far city ("… , Lerik") be answered by "Bakı" =
  // the venue itself → km 0 "Bakı, Azərbaycan" for a 215 km customer.
  if (!detected && anchorCity) push(anchorCity, 'area');
  const singles = [...asciiParts].sort((a, b) => b.length - a.length);
  for (const s of singles) push(s, 'area');
  return out.slice(0, 6); // hard cap: max 6 Nominatim calls per address
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 11x (owner: "o mapda istediyin her sey var" — the map IS the search):
// city centroid for the mini-map FOCUS. When the exact point is unresolved,
// the map zooms to the typed city (district level — street labels readable
// on the OSM tiles) and the operator places the pin by eye. 24h cache: a
// city never moves, ONE Nominatim call per city per day maximum.
const cityPointCache = new Map<string, { t: number; lat: number; lng: number }>();
export async function cityPoint(name: string): Promise<{ lat: number; lng: number } | null> {
  const key = transliterate(name).toLowerCase();
  const hit = cityPointCache.get(key);
  if (hit && Date.now() - hit.t < 86_400_000) return { lat: hit.lat, lng: hit.lng };
  const r = await nominatimOnce(name);
  if (r) {
    cityPointCache.set(key, { t: Date.now(), lat: r.lat, lng: r.lng });
    return { lat: r.lat, lng: r.lng };
  }
  return null;
}

export async function nominatimOnce(q: string): Promise<{ lat: number; lng: number; display: string; type: string } | null> {
  const key = q.trim().toLowerCase();
  // token bucket: min 1100ms between Nominatim calls (11x: the old 550ms
  // averaged ~1.8 req/s — above Nominatim's 1 req/s policy → IP 429 bursts)
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    // countrycodes=az (11s): keep matches inside Azerbaijan — "Niyazi",
    // "Quba" etc. exist in other countries too; without the bias Nominatim
    // can return a foreign hit for a local address.
    const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=az&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return null;
    const rows = await res.json();
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) return null;
    // 11x (E2E catch): Nominatim can return EMPTY lat/lon strings for some
    // candidates (badly-tagged relations) — Number("") === 0 → a (0,0)
    // "point" → 6734.9 km. Reject empty strings AND null-island.
    const latRaw = typeof r.lat === 'string' ? r.lat.trim() : r.lat;
    const lngRaw = typeof r.lon === 'string' ? r.lon.trim() : r.lon;
    if (latRaw == null || lngRaw == null || latRaw === '' || lngRaw === '') return null;
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    // 11z: the OSM type of the hit — Nominatim free-text happily answers a
    // FULL STREET QUERY with a coarse object (city/town/station/lake); the
    // nominatim() chain must downgrade those instead of treating them as
    // address-level (see STREET_LEVEL_TYPES).
    return { lat, lng, display: r.display_name || q, type: String(r.addresstype || r.type || '') };
  } catch {
    return null;
  }
}

// Miss cache (11s): the anchor retry pass must not re-call candidates that
// already failed 2 seconds ago — Nominatim rate discipline.
const geoMiss = new Map<string, number>();

// 11s (owner): far-hit guard. A restaurant does not deliver 300 km. When the
// customer's address names NO place token, a bare fuzzy hit far from the
// venue is a mis-anchor (repro: "Nizami Cəfərov 12" → "İsaq Cəfərov, Nizami
// rayonu, GƏNCƏ", 293 km from the Bakı venue). Such hits are treated as
// misses so the venue-city-anchored candidates get their turn.
const FAR_HIT_KM = 120;

// 11z: Nominatim types that are ACTUAL street/building points. Anything else
// (city, town, village, station, railway, lake, peak, …) under an 'address'-
// declared candidate is a COARSE free-text answer — verified: "q=Bakı"
// returns the city centroid (which IS the venue point → km 0) and "q=nizami"
// returns the metro station. Such hits must be downgraded to 'area' so the
// local-gazetteer fallback can fix them and so a 30-day persist never locks
// a city point in for a street query.
const STREET_LEVEL_TYPES = new Set([
  'road', 'residential', 'building', 'house', 'entrance', 'platform',
  'track', 'path', 'pedestrian', 'steps', 'cycleway', 'footway', 'bridleway',
  'unclassified', 'service', 'living_street', 'raceway', 'byway', 'proposed',
  'construction', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
]);

interface CityShortcut { nameFold: string; lat: number; lng: number; display: string }

async function nominatim(
  q: string,
  anchorCity?: string | null,
  farGuard?: (lat: number, lng: number) => boolean,
  // 11z: the typed city's LOCAL centroid (cities-az.json). The chain's city
  // candidate is answered from the gazetteer — ZERO Nominatim calls and the
  // correct OSM town point, no matter what Nominatim's flaky free-text says.
  cityShortcut?: CityShortcut | null,
  // 11z: CITY VALIDATION — when the address names a city, a Nominatim hit
  // whose display lacks that city is a WRONG-CITY free-text garbage (caught:
  // "Nizami 12, sumahit" → Nominatim answered a road named "Xızı" 100 km
  // away, type=road so the coarse downgrade couldn't see it, farGuard let it
  // through, and the local fallback was skipped under 'address'). Reject →
  // the chain continues to the city-qualified candidate.
  expectCityFold?: string | null,
): Promise<{ lat: number; lng: number; display: string; precision: 'address' | 'area' } | null> {
  for (const c of candidates(q, anchorCity)) {
    const key = transliterate(c.text).toLowerCase();
    const hit = geoCache.get(key);
    if (hit && Date.now() - hit.t < 15_000) return { lat: hit.lat, lng: hit.lng, display: hit.display, precision: hit.precision };
    const missed = geoMiss.get(key);
    if (missed && Date.now() - missed < 15_000) continue;
    if (cityShortcut && c.precision === 'area' && key === cityShortcut.nameFold) {
      geoCache.set(key, { t: Date.now(), lat: cityShortcut.lat, lng: cityShortcut.lng, display: cityShortcut.display, precision: 'area', type: 'local-city' });
      return { lat: cityShortcut.lat, lng: cityShortcut.lng, display: cityShortcut.display, precision: 'area' };
    }
    const r = await nominatimOnce(c.text);
    if (r) {
      if (farGuard && farGuard(r.lat, r.lng)) {
        geoMiss.set(key, Date.now()); // suspicious — keep trying
        if (geoMiss.size > 200) geoMiss.delete(geoMiss.keys().next().value as string);
        continue;
      }
      if (expectCityFold && !transliterate(r.display).toLowerCase().includes(expectCityFold)) {
        // wrong-city free-text hit — treat as a miss, keep the chain going
        geoMiss.set(key, Date.now());
        if (geoMiss.size > 200) geoMiss.delete(geoMiss.keys().next().value as string);
        continue;
      }
      const coarse = !STREET_LEVEL_TYPES.has(r.type);
      const precision = coarse && c.precision === 'address' ? 'area' : c.precision;
      geoCache.set(key, { t: Date.now(), lat: r.lat, lng: r.lng, display: r.display, precision, type: r.type });
      if (geoCache.size > 200) geoCache.delete(geoCache.keys().next().value as string);
      geoMiss.delete(key);
      return { ...r, precision };
    }
    geoMiss.set(key, Date.now());
    if (geoMiss.size > 200) geoMiss.delete(geoMiss.keys().next().value as string);
  }
  return null;
}

const PLACEHOLDER_ADDRESSES = new Set(['', 'default location', 'n/a', '-']);

// ── 11x: REVERSE MODE (manual map pin) ─────────────────────────────────────
// GET /api/geocode?lat=..&lng=.. — the operator tapped/dragged the mini-map
// pin; the point is the truth. Nominatim reverse gives the address text
// (30s cache; on 429/failure → coordinate string + reverse_failed flag, and
// the panel keeps the operator's typed text instead of overwriting it).
const revCache = new Map<string, { t: number; display: string }>();
async function reverseDisplay(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = revCache.get(key);
  if (hit && Date.now() - hit.t < 30_000) return hit.display;
  let display = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=az`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    );
    if (res.ok) {
      const d: any = await res.json();
      const raw = d?.display_name || '';
      if (raw) display = raw.replace(/,\s*(Azərbaycan|Azerbaijan)$/i, '');
    }
  } catch { /* keep the coordinate string */ }
  revCache.set(key, { t: Date.now(), display });
  if (revCache.size > 100) revCache.delete(revCache.keys().next().value as string);
  return display;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const rawAddr = (request.nextUrl.searchParams.get('address') || '').trim();
    // 11x: "9cu" → "9-cü" (OSM AZ ordinal tags) — before ANY candidate chain.
    const q = normalizeOrdinal(rawAddr);
    // 11x: reverse mode — manual mini-map pin (point is the truth).
    // 11y (CRITICAL fix — owner "qəfil işləməmə"): `searchParams.get()`
    // returns `null` when absent and `Number(null) === 0` — the old code
    // treated EVERY forward geocode as a reverse pin at (0,0) (km 6734.9).
    // Reverse ONLY when both params are explicitly present AND not (0,0).
    const latParam = request.nextUrl.searchParams.get('lat');
    const lngParam = request.nextUrl.searchParams.get('lng');
    const rLat = latParam != null ? Number(latParam) : NaN;
    const rLng = lngParam != null ? Number(lngParam) : NaN;
    const reverse = latParam != null && lngParam != null
      && Number.isFinite(rLat) && Number.isFinite(rLng)
      && Math.abs(rLat) <= 90 && Math.abs(rLng) <= 180
      && !(rLat === 0 && rLng === 0);
    if (!reverse && q.length < 6) {
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

    // ── 2) customer point ───────────────────────────────────────────────────
    let c: { lat: number; lng: number; display: string; precision: 'address' | 'area' } | null;
    // 11x: reverse mode (manual map pin) — the point IS the answer; only the
    // display text is reverse-geocoded (never a failure point).
    let reverseFailed = false;
    // 11z: hoisted for section 3 — the cache-write moved to AFTER the OSRM
    // route geometry is known, so a persisted street address also persists
    // its route line (regulars see the route with zero OSRM calls).
    let ckey = '';
    let cachedRouteGeometry: [number, number][] | null = null;
    let fromCache = false;
    if (reverse) {
      const display = await reverseDisplay(rLat, rLng);
      reverseFailed = display.split(',').every(s => /^-?\d/.test(s.trim()));
      c = { lat: rLat, lng: rLng, display, precision: 'address' };
    } else {
      // 11y: PERSISTENT CACHE — repeat addresses (regulars!) resolve in ~0ms
      // with ZERO Nominatim calls: no latency, no 429, no "qəfil işləməmə".
      // Key is venue-scoped (points are venue-relative).
      ckey = `g:${q.toLowerCase()}:${vLat!.toFixed(4)},${vLng!.toFixed(4)}`;
      const cached = await geoCacheGet(ckey);
      if (cached) {
        c = { lat: cached.lat, lng: cached.lng, display: cached.display, precision: cached.precision };
        cachedRouteGeometry = cached.routeGeometry ?? null;
        fromCache = true;
      } else {
        const noPlaceToken = !detectPlace(q);
        // 11x (E2E catch): HARD far guard ALWAYS on — even a city-qualified
        // candidate can return a stray hit (empty coords → (0,0) → 6734 km).
        // A restaurant never delivers >500 km; treat such hits as misses.
        const farGuard = (lat: number, lng: number) =>
          haversineKm(vLat, vLng!, lat, lng) > (noPlaceToken ? FAR_HIT_KM : 500);
        // 11z: the typed city's LOCAL centroid (cities-az.json) — (a) a
        // zero-Nominatim shortcut for the chain's city candidate and (b) the
        // final area-level fallback below. Nominatim's free-text city answers
        // are inconsistent between calls; the OSM town point is not.
        const dpL0 = detectPlace(q);
        const localCity0 = dpL0?.city ? localCityPoint(dpL0.city) : null;
        const cityShortcut0 = localCity0 && dpL0
          ? { nameFold: transliterate(dpL0.city).toLowerCase(), lat: localCity0.lat, lng: localCity0.lng, display: localCity0.display }
          : null;
        c = await nominatim(q, null, farGuard, cityShortcut0,
          dpL0?.city ? transliterate(dpL0.city).toLowerCase() : null);
        if (!c && noPlaceToken) {
          // 11s: input names no AZ place token ("Nizami Cəfərov 12") → retry
          // anchored on the venue's own city ("Nizami Cəfərov 12, Bakı").
          const anchor = await venueCityOf(vLat, vLng!);
          if (anchor) {
            const anchorLocal = localCityPoint(anchor);
            // no expectCity here — the anchor is a GUESS (no typed city), so
            // free-text hits stay allowed (the local fallback still upgrades).
            c = await nominatim(q, anchor, farGuard,
              anchorLocal
                ? { nameFold: transliterate(anchor).toLowerCase(), lat: anchorLocal.lat, lng: anchorLocal.lng, display: anchorLocal.display }
                : null);
          }
        }
        // 11y (owner: "hər dəfə düzgün və sürətli işləsin, qəfil
        // işləməmə olmasın"): LOCAL GAZETTEER, zero network, instant —
        //   (a) Nominatim chain FAILED (429 / CDN throttle / street missing
        //       from free-text) → the street still resolves;
        //   (b) Nominatim fell back to a CITY CENTROID (precision 'area' —
        //       e.g. typo "Nizamii" → "Bakı, Azərbaycan", km 0) → the
        //       street centroid (km ~3) is the far better fee estimate.
        // Both cases: Bakı+Sumqayıt only; a named city absent from the
        // gazetteer is never guessed into another city (localStreetPoint).
        const dpL = detectPlace(q);
        const localCity = dpL?.city ? localCityPoint(dpL.city) : null;
        // pure-city input ("Bakı") has no street part — never street-match it
        // (a "Bakıxanov" prefix hit would be a wrong-city-of-a-street guess).
        const restL = (dpL ? dpL.restAZ : q).replace(/\s+\d{1,4}[a-zа-яa-z]?$/i, '').trim();
        let localStreetHit = false;
        if (restL.length >= 3 && (!c || c.precision === 'area')) {
          const lp = localStreetPoint(restL, dpL?.city ?? null, vLat!, vLng!);
          if (lp) { c = { lat: lp.lat, lng: lp.lng, display: lp.display, precision: 'area' }; localStreetHit = true; }
        }
        // 11z: CITY CENTROID last resort — the street part is unknown (typo,
        // unmapped village street) but the city IS known → the town's real OSM
        // point, not a 404 and not Nominatim's flaky answer. A street-level
        // local hit (localStreetHit) is FINER than the city and wins.
        if (!localStreetHit && localCity && (!c || c.precision === 'area')) {
          c = { lat: localCity.lat, lng: localCity.lng, display: localCity.display, precision: 'area' };
        }
        if (!c) return NextResponse.json({ error: 'Ünvan tapılmadı — manual KM istifadə edin' }, { status: 404 });
        // 11y/11z: persist STREET-LEVEL results only — a city/area centroid
        // for a street query is a FALLBACK, not an answer (30-day freeze of a
        // wrong km). The cache WRITE itself happens in section 3, after the
        // OSRM route geometry is known, so the persisted entry carries its
        // route line too (regulars: zero Nominatim AND zero OSRM).
      }
    }

    // ── 3) distance ────────────────────────────────────────────────────────
    // 11w-C (owner: "fee OSRM yol-KM ilə"): the FEE distance is REAL road km
    // (OSRM, free/keyless), not the straight line — haversine undercounts
    // 10–30% (a 4.7 km straight line is often ~6 km of streets). OSRM down →
    // graceful fallback to the straight line (routed:false), never a failure.
    const kmStraight = Math.round(haversineKm(vLat, vLng!, c.lat, c.lng) * 10) / 10;
    let km = kmStraight;
    let routed = false;
    let routeGeometry: [number, number][] | null = null;
    if (fromCache) {
      // regular — no network at all (the geometry was persisted with the point)
      routeGeometry = cachedRouteGeometry;
    } else {
      const road = await osrmRoute(vLng!, vLat, c.lng, c.lat);
      if (road) { km = road.km; routed = true; }
      routeGeometry = road?.geometry ?? null;
    }
    // 11z: persist the route line WITH the address (street-level only — same
    // rule as before, now with geometry).
    if (!fromCache && !reverse && c.precision === 'address') {
      geoCacheSet(ckey, { lat: c.lat, lng: c.lng, display: c.display, precision: c.precision, routeGeometry });
    }
    return NextResponse.json({
      km,
      km_straight: kmStraight,
      routed,
      // 11z: the ACTUAL road polyline [lng, lat]×N (venue→customer, ≤120 pts)
      // — the mini-map draws it, so the operator sees the route itself, not
      // just two dots. null when OSRM has no drivable route (graceful).
      route_geometry: routeGeometry,
      venue_lat: vLat,
      venue_lng: vLng,
      customer_lat: c.lat,
      customer_lng: c.lng,
      display: c.display,
      precision: c.precision,
      // 11x: true = Nominatim reverse failed (429/offline) → display is a
      // coordinate string; the panel keeps the operator's typed text.
      reverse_failed: reverseFailed || undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Geocode xətası' }, { status: 500 });
  }
}
