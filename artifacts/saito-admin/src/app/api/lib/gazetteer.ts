// ============================================================================
// 2026-10-01 (11u, 11w-D, 11y): LOCAL STREET GAZETTEER — shared helpers.
//
// 11u (owner: "2 yazsam birdən-birə nəticə olmalıdır"): 1124 unique streets
// (Bakı + Sumqayıt) with OSM center points, fetched ONE-TIME from Overpass
// and committed to the repo (src/data/streets-az.json, ~84 KB). The
// "küçəsi/küç./prospekti/bulvarı/sokağı" suffixes are folded away during the
// one-time build, so "20 Yanvar" and "20 Yanvar küçəsi" are ONE entry.
// 1-2 char input = pure local prefix match: ZERO Nominatim calls, ~1 ms.
//
// 11y (owner: "axtarış sistemi hər dəfə düzgün və sürətli işləsin"): this
// module is now shared by BOTH /api/geocode/suggest (dropdown merge) and
// /api/geocode (last-resort fallback when the Nominatim chain fails — 429,
// CDN throttle, or a street missing from its free-text index). Bakı+
// Sumqayıt addresses then resolve INSTANTLY with zero network.
//
// DESIGN NOTE — no imports from ../geocode/route: that file imports THIS
// one (fallback), so importing transliterate/haversineKm back would create
// a module-evaluation cycle (GAZETTEER is built at load time). The tiny
// helpers are duplicated below instead — deliberate.
// ============================================================================

import streetsRaw from '@/data/streets-az.json';
// 11z: named POIs nationwide (shops/amenities/tourism/office/craft) — the
// "bravo sumqayit" class of addresses resolves to a real object point, not
// just a street. Built by scripts/build-gazetteer-nationwide.py (Overpass).
import poisRaw from '@/data/pois-az.json';
// 11z: city/town centroids (106 entries, 5 KB) — Nominatim-free city answers.
// OSM place=* from the same Geofabrik extract; Hacıqəbələ + İsgəndərli are
// manual entries (OSM has NO data for them at all — see build-cities).
import citiesRaw from '@/data/cities-az.json';

const AZ_TO_ASCII: Record<string, string> = {
  'ə': 'e', 'Ä': 'e', 'ä': 'e', 'ı': 'i', 'İ': 'i',
  'ç': 'c', 'Ç': 'C', 'ö': 'o', 'Ö': 'O', 'ü': 'u', 'Ü': 'U',
  'ş': 's', 'Ş': 'S', 'ğ': 'g', 'Ğ': 'G', 'Ə': 'E',
};
function translitLocal(q: string): string {
  return q
    .replace(/[əäıİçöüşğƏÄÇÖÜŞĞ]/g, ch => AZ_TO_ASCII[ch] || ch)
    .replace(/\s+/g, ' ')
    .trim();
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

interface GazetteerStreet { n: string; c: string; la: number; lo: number; k: number }
const GAZETTEER: (GazetteerStreet & { f: string })[] = (streetsRaw as GazetteerStreet[]).map(s => ({
  ...s,
  f: translitLocal(s.n).toLowerCase(),
}));

// 11z: named POIs (metro areas) — "Bravo, Sumqayıt" class addresses resolve
// to the object itself, not just its street. Same {n,c,la,lo} shape + t=class.
interface GazetteerPoi { n: string; c: string; la: number; lo: number; t: string }
const POIS: (GazetteerPoi & { f: string })[] = (poisRaw as GazetteerPoi[]).map(p => ({
  ...p,
  f: translitLocal(p.n).toLowerCase(),
}));

// 11z: city/town centroids. pl = rank (city=0, town=1, …) — kept for future
// disambiguation; matching is by name only.
interface GazetteerCity { n: string; la: number; lo: number; pl: number }
const CITIES: (GazetteerCity & { f: string })[] = (citiesRaw as GazetteerCity[]).map(c => ({
  ...c,
  f: translitLocal(c.n).toLowerCase(),
}));

type NamedPoint = { f: string; n: string; c: string; la: number; lo: number };

export interface LocalStreetItem {
  name: string;   // "<street>, <city>"
  lat: number;
  lng: number;
  km: number;     // haversine venue→point, 0.1 rounded (display only)
  type: string;   // 'street'
}

/**
 * Entry-name starts with the query ("niz" → every Nizami street).
 * 11z: POI prefix hits ("brav" → Bravo market) fill the remaining slots —
 * objects are a first-class search target (owner: "binaları, obyektləri
 * dəqiq tanısın").
 */
export function localPrefix(q: string, vLat: number, vLng: number, cap: number): LocalStreetItem[] {
  const fq = translitLocal(q).toLowerCase();
  const out: LocalStreetItem[] = [];
  for (const s of GAZETTEER) { // pre-sorted by segment count desc (major streets first)
    if (!s.f.startsWith(fq)) continue;
    out.push({
      name: `${s.n}, ${s.c}`,
      lat: s.la,
      lng: s.lo,
      km: Math.round(haversineKm(vLat, vLng, s.la, s.lo) * 10) / 10,
      type: 'street',
    });
    if (out.length >= cap) break;
  }
  for (const p of POIS) {
    if (out.length >= cap) break;
    if (!p.f.startsWith(fq)) continue;
    out.push({
      name: `${p.n}, ${p.c}`,
      lat: p.la,
      lng: p.lo,
      km: Math.round(haversineKm(vLat, vLng, p.la, p.lo) * 10) / 10,
      type: 'poi',
    });
  }
  return out;
}

// 11w-D (owner: "fuzzy + ev nömrəsi"): LEVENSHTEIN on the local index.
// "nizamii", "20 yanvrr" → the right street WITHOUT any Nominatim call (the
// local scan is ~1–3 ms over 1124 entries — still instant). Threshold: ≤1
// edit for <7-char queries, ≤2 for longer (prevents junk on short typos).
function lev(a: string, b: string, max: number): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    prev = cur;
    // 11z: early-exit at ROW END only — breaking the inner loop and using
    // the partial row corrupts later rows and can return a distance LOWER
    // than the true one (caught: "nizami" vs "xizi" = 2 instead of 3, which
    // let a street name masquerade as the city "Xızı" in detectPlace).
    if (rowMin > max) return max + 1;
  }
  return prev[n];
}

// 12b (owner: "sumqayit 34 sayli mekteb yaziram — yanlış məktəb gəlir
// (11 saylı)"): NAME NUMBERS = digits that IDENTIFY the entity itself —
// "34 saylı məktəb", "12 nömrəli", "9-cü mikrorayon". A house number
// ("Nizami 12") is NOT a name number: the digit is not followed by
// saylı/say/nömrəli/-cü/-ci, so this guard can never block house queries.
// Input is FOLDED (ASCII, lowercase). \d{1,3} excludes 4-digit postals.
const NAME_NUM_RE = /\b(\d{1,3})(?:\s*[-\s]?(?:sayl\w*|nomr\w*|cu|ci))\b/g;
export function nameNumbers(folded: string): string[] {
  const out = new Set<string>();
  NAME_NUM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAME_NUM_RE.exec(folded)) !== null) out.add(m[1]);
  return [...out];
}

// 12b: the query carries a name number ("34") and the candidate carries its
// OWN name number ("11") but not the queried one → a DIFFERENT numbered
// entity ("11 saylı Məktəb" is not "34 saylı məktəb") → reject. If either
// side has no name number at all → no conflict (Nominatim street answers
// rarely carry the house number — those must keep flowing).
export function numberMismatch(queryFolded: string, candidateFolded: string): boolean {
  const q = nameNumbers(queryFolded);
  if (!q.length) return false;
  const c = nameNumbers(candidateFolded);
  if (!c.length) return false;
  return q.every((n) => !c.includes(n));
}

/**
 * Typos against the FULL name ("nizami" → "nizamii" is shorter than
 * "nizami cefarov") AND against a same-length PREFIX ("nizamii" ≈ the first
 * 7 chars of "nizami cefarov") — both are what an operator types. Prefix
 * matches are skipped (localPrefix's job); `skip` = names already returned.
 */
export function localFuzzy(q: string, vLat: number, vLng: number, cap: number, skip: Set<string>): LocalStreetItem[] {
  const fq = translitLocal(q).toLowerCase().trim();
  if (fq.length < 4) return [];
  const maxDist = fq.length < 7 ? 1 : 2;
  const scored: { d: number; it: LocalStreetItem }[] = [];
  for (const s of GAZETTEER) {
    if (skip.has(s.n)) continue;
    if (numberMismatch(fq, s.f)) continue; // 12b: name numbers are identity
    if (s.f.startsWith(fq) || fq.startsWith(s.f)) continue; // prefix = localPrefix's job
    let d = lev(fq, s.f, maxDist);
    if (d > maxDist && s.f.length > fq.length) {
      d = lev(fq, s.f.slice(0, fq.length), maxDist);
    }
    if (d === 0 || d > maxDist) continue;
    scored.push({
      d,
      it: {
        name: `${s.n}, ${s.c}`,
        lat: s.la,
        lng: s.lo,
        km: Math.round(haversineKm(vLat, vLng, s.la, s.lo) * 10) / 10,
        type: 'street',
      },
    });
    if (scored.length >= 24) break; // enough candidates — sort + cap below
  }
  // 11z: the same typo scan over named POIs ("bravo" → "Bravo, Sumqayıt").
  for (const p of POIS) {
    if (scored.length >= 36) break;
    if (skip.has(p.n)) continue;
    if (numberMismatch(fq, p.f)) continue; // 12b: name numbers are identity
    if (p.f.startsWith(fq) || fq.startsWith(p.f)) continue; // prefix = localPrefix's job
    let d = lev(fq, p.f, maxDist);
    if (d > maxDist && p.f.length > fq.length) d = lev(fq, p.f.slice(0, fq.length), maxDist);
    if (d === 0 || d > maxDist) continue;
    scored.push({
      d,
      it: {
        name: `${p.n}, ${p.c}`,
        lat: p.la,
        lng: p.lo,
        km: Math.round(haversineKm(vLat, vLng, p.la, p.lo) * 10) / 10,
        type: 'poi',
      },
    });
  }
  scored.sort((a, b) => a.d - b.d || a.it.km - b.it.km);
  return scored.slice(0, cap).map(s => s.it);
}

// 11z: street-type suffixes in the FOLDED (ASCII, lowercase) space —
// "Nizami küçəsi" → "nizami" BEFORE matching (the build kept the display
// suffix, so the query side must fold it away). Includes the typo variants
// operators actually type: "cucı/cucesi" (küçəsi with the dropped "k"),
// "prosp", "bulvar" etc. — a last word within Levenshtein ≤ 2 of a known
// suffix is stripped. Safe: only the LAST word is inspected, and the
// remainder must still be ≥ 3 chars.
const STREET_SUFFIX_FOLDED = [
  'kucesi', 'kuce', 'kuc', 'prospekti', 'prospekt', 'bulvari', 'bulvar', 'sogagi',
];
function foldStreetSuffix(fq: string): string {
  let prev = '';
  while (prev !== fq) {
    prev = fq;
    // exact folded suffix ("… kucesi" / "… prospekti", optional dot)
    fq = fq.replace(/ (kucesi|kuce|kuc|prospekti|prospekt|bulvari|bulvar|sogagi)\.?$/i, '').trim();
    if (fq.length < 3) break;
    // typo'd last word ("cucesi" ≈ "kucesi")
    const parts = fq.split(' ');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].replace(/\.$/, '');
      if (last.length >= 3 && last.length <= 10) {
        if (STREET_SUFFIX_FOLDED.some(s => Math.abs(s.length - last.length) <= 2 && lev(last, s, 2) <= 2)) {
          fq = parts.slice(0, -1).join(' ').trim();
        }
      }
    }
  }
  return fq;
}

/**
 * 11y: a FULL TYPED ADDRESS (not a search prefix) → street point, zero
 * network. Used by /api/geocode when the Nominatim chain fails — nationwide
 * streets still resolve instantly (offline-safe delivery).
 *
 * `streetText` = the street part of the address (city + house number
 * already stripped by the caller). Tier cascade (each tier city-filtered
 * independently, fall-through only when the in-city pool is empty):
 * street exact → POI exact → street prefix → POI prefix → Levenshtein.
 * `city` (when the address named one) restricts every tier to that city —
 * a same-named street in another city is never guessed.
 */
export function localStreetPoint(
  streetText: string,
  city: string | null,
  vLat: number,
  vLng: number,
): { lat: number; lng: number; display: string } | null {
  let fq = foldStreetSuffix(translitLocal(streetText).toLowerCase().trim());
  if (fq.length < 3) return null;

  // 11z: streets AND POIs, NATIONWIDE. PER-TIER city selection: each tier is
  // city-filtered INDEPENDENTLY and only falls through to the next tier when
  // its in-city pool is empty. (The old single pool + single filter broke at
  // nationwide scale: "Nizami" has exact streets in 10+ foreign cities, so
  // the exact tier filled up, the "baki" filter emptied it, and the function
  // returned null — never reaching the PREFIX tier where "Nizami Cəfərov,
  // Bakı" lives.) Within a tier, the candidate CLOSEST TO THE VENUE wins
  // (a Baku cashier typing "Nizami küçəsi" with no city wants Bakı's Nizami,
  // not Lerik's).
  type Cand = { d: number; it: NamedPoint };
  const cityFold = city ? translitLocal(city).toLowerCase() : null;
  const inCity = (c: string) => !cityFold || translitLocal(c).toLowerCase().includes(cityFold);
  const pick = (tier: Cand[]): { lat: number; lng: number; display: string } | null => {
    if (!tier.length) return null;
    const pool = cityFold ? tier.filter(b => inCity(b.it.c)) : tier;
    if (!pool.length) return null;
    pool.sort((a, b) =>
      haversineKm(vLat, vLng, a.it.la, a.it.lo) - haversineKm(vLat, vLng, b.it.la, b.it.lo));
    const it = pool[0].it;
    return { lat: it.la, lng: it.lo, display: `${it.n}, ${it.c}` };
  };

  // 1) street exact name — "nizami" (10+ cities carry exactly "Nizami").
  const exact: Cand[] = [];
  for (const s of GAZETTEER) if (s.f === fq) exact.push({ d: 0, it: s });
  const r1 = pick(exact); if (r1) return r1;

  // 2) POI exact — an object named exactly the typed word ("Bravo").
  const poiExact: Cand[] = [];
  for (const p of POIS) if (p.f === fq) poiExact.push({ d: 0, it: p });
  const r2 = pick(poiExact); if (r2) return r2;

  // 3) street prefix — "nizami" → "Nizami Cəfərov, Bakı"; "20" → "20 Yanvar".
  const prefix: Cand[] = [];
  for (const s of GAZETTEER) if (s.f.startsWith(fq)) prefix.push({ d: 0, it: s });
  const r3 = pick(prefix); if (r3) return r3;

  // 4) POI prefix — "bravo" → "Bravo Səbail" when there is no exact POI.
  const poiPrefix: Cand[] = [];
  for (const p of POIS) if (p.f.startsWith(fq)) poiPrefix.push({ d: 0, it: p });
  const r4 = pick(poiPrefix); if (r4) return r4;

  // 4b) FIRST-TOKEN prefix — OSM name drift on multi-word names: the
  // operator types "Nizami Cəfərov 27, Bakı" but the gazetteer knows Bakı's
  // street as "Nizami küçəsi" (no "Cəfərov" in OSM). Matching the first
  // token (city-filtered, venue-nearest) lands on the right street for fee
  // purposes. Multi-word queries only, token ≥ 3 chars ("20" is excluded —
  // "20 yanvar" must stay exact/prefix territory).
  if (fq.includes(' ')) {
    const firstTok = fq.split(' ')[0];
    if (firstTok.length >= 3) {
      const tok: Cand[] = [];
      for (const s of GAZETTEER) if (s.f.startsWith(firstTok) && s.f !== fq) tok.push({ d: 1, it: s });
      const r4b = pick(tok); if (r4b) return r4b;
    }
  }

  // 5) Levenshtein (streets, then POIs) — "nizamii", "çayli" typos.
  const maxDist = fq.length < 7 ? 1 : 2;
  const fuzzy: Cand[] = [];
  for (const s of GAZETTEER) {
    // 12b: a Levenshtein hit across NAME NUMBERS is a different entity
    // ("34 saylı məktəb" ≈2 "11 saylı məktəb" — that is NOT the answer).
    if (numberMismatch(fq, s.f)) continue;
    let d = lev(fq, s.f, maxDist);
    if (d > maxDist && s.f.length > fq.length) d = lev(fq, s.f.slice(0, fq.length), maxDist);
    if (d === 0 || d > maxDist) continue;
    fuzzy.push({ d, it: s });
  }
  if (!fuzzy.length) for (const p of POIS) {
    if (numberMismatch(fq, p.f)) continue; // 12b
    let d = lev(fq, p.f, maxDist);
    if (d > maxDist && p.f.length > fq.length) d = lev(fq, p.f.slice(0, fq.length), maxDist);
    if (d === 0 || d > maxDist) continue;
    fuzzy.push({ d, it: p });
  }
  if (fuzzy.length) {
    fuzzy.sort((a, b) => a.d - b.d);
    const r5 = pick(fuzzy); if (r5) return r5;
  }
  return null;
}

// 11z: city/town centroid for a named city — ZERO network, always the real
// OSM town point. Exact folded-name match first, then Levenshtein ≤ 2 (OSM
// spelling drift: the dictionary says "Xırdalar", OSM says "Xırdalan").
// The geocode route uses this to (a) answer city candidates without calling
// Nominatim (its free-text city answers are inconsistent between calls),
// (b) resolve cities Nominatim has NO data for (Hacıqəbələ, İsgəndərli),
// (c) replace a Nominatim 'area' hit with the correct centroid.
export function localCityPoint(city: string): { lat: number; lng: number; display: string } | null {
  const fq = translitLocal(city).toLowerCase().trim();
  if (fq.length < 3) return null;
  for (const c of CITIES) {
    if (c.f === fq) return { lat: c.la, lng: c.lo, display: `${c.n}, Azərbaycan` };
  }
  let best: { d: number; c: GazetteerCity & { f: string } } | null = null;
  for (const c of CITIES) {
    const d = lev(fq, c.f, 2);
    if (d >= 1 && d <= 2 && (!best || d < best.d)) best = { d, c };
  }
  return best ? { lat: best.c.la, lng: best.c.lo, display: `${best.c.n}, Azərbaycan` } : null;
}
