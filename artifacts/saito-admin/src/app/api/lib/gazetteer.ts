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

export interface LocalStreetItem {
  name: string;   // "<street>, <city>"
  lat: number;
  lng: number;
  km: number;     // haversine venue→point, 0.1 rounded (display only)
  type: string;   // 'street'
}

/** Entry-name starts with the query ("niz" → every Nizami street). */
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
    if (rowMin > max) break;
    prev = cur;
  }
  return prev[n];
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
  scored.sort((a, b) => a.d - b.d || a.it.km - b.it.km);
  return scored.slice(0, cap).map(s => s.it);
}

/**
 * 11y: a FULL TYPED ADDRESS (not a search prefix) → street point, zero
 * network. Used by /api/geocode when the Nominatim chain fails — Bakı+
 * Sumqayıt streets still resolve instantly (offline-safe delivery).
 *
 * `streetText` = the street part of the address (city + house number
 * already stripped by the caller). The build folded the street-type
 * suffix, so "Nizami küçəsi" must be folded to "Nizami" BEFORE matching
 * (the reverse direction: here the QUERY is longer than the entry name,
 * unlike localPrefix). Exact first, then prefix, then Levenshtein.
 * `city` (when the address named one) prefers that city's entry when the
 * street exists in both Bakı and Sumqayıt.
 */
export function localStreetPoint(
  streetText: string,
  city: string | null,
  vLat: number,
  vLng: number,
): { lat: number; lng: number; display: string } | null {
  let fq = translitLocal(streetText).toLowerCase().trim();
  // fold street-type suffixes ("… cucesi" / "… prospekti" / "… bulvarı").
  let prev = '';
  while (prev !== fq) {
    prev = fq;
    fq = fq.replace(/ (k[üu]c\.?esi?|prospekt\.?i?|bulvar\.?ı?|saka[ğg]ı)\.?$/i, '').trim();
  }
  if (fq.length < 3) return null;

  type Cand = { d: number; it: GazetteerStreet };
  let best: Cand[] = [];
  for (const s of GAZETTEER) {
    if (s.f === fq) { best = [{ d: 0, it: s }]; break; }
  }
  if (!best.length) {
    for (const s of GAZETTEER) {
      if (s.f.startsWith(fq)) { best.push({ d: 0, it: s }); if (best.length >= 8) break; }
    }
  }
  if (!best.length) {
    const maxDist = fq.length < 7 ? 1 : 2;
    for (const s of GAZETTEER) {
      let d = lev(fq, s.f, maxDist);
      if (d > maxDist && s.f.length > fq.length) d = lev(fq, s.f.slice(0, fq.length), maxDist);
      if (d === 0 || d > maxDist) continue;
      best.push({ d, it: s });
      if (best.length >= 24) break;
    }
    best.sort((a, b) => a.d - b.d);
  }
  if (!best.length) return null;

  // The address NAMED a city ("… , Bərdə") but the gazetteer has no entry
  // for it (only Bakı+Sumqayıt) → return null: guessing a SAME-NAMED street
  // in another city would be a worse answer than the city centroid.
  const cityFold = city ? translitLocal(city).toLowerCase() : null;
  const cityPref = cityFold ? best.filter(b => translitLocal(b.it.c).toLowerCase().includes(cityFold)) : best;
  if (!cityPref.length) return null;
  const pick = cityPref[0].it;
  return { lat: pick.la, lng: pick.lo, display: `${pick.n}, ${pick.c}` };
}
