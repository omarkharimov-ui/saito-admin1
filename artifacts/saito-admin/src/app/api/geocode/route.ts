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
export function transliterate(q: string): string {
  return q
    .replace(/[əäıİçöüşğƏÄÇÖÜŞĞ]/g, ch => AZ_TO_ASCII[ch] || ch)
    .replace(/\s+/g, ' ')
    .trim();
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
  { name: 'Naxçıvan', variants: ['naxcivan', 'nakhchivan'] },
];
const PLACE_LOOKUP = new Map<string, string>();
for (const p of AZ_PLACES) for (const v of p.variants) PLACE_LOOKUP.set(v, p.name);

/**
 * Find the place token (any position in the string) via the variant
 * dictionary. Returns the rest of the address in BOTH scripts (AZ original
 * and ASCII) so the candidate chain can try each against OSM's AZ / EN tags.
 */
function detectPlace(azText: string): { city: string; restAZ: string; restASCII: string } | null {
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
  return null;
}

// Venue's own city (Nominatim reverse, in-process cached) — the anchor used
// when the customer's address names no place token at all.
let venueCityCache: { key: string; city: string | null } = { key: '', city: null };
async function venueCityOf(vLat: number, vLng: number): Promise<string | null> {
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
  else if (anchorCity) push(anchorCity, 'area');
  for (let i = 1; i < asciiParts.length; i++) push(asciiParts.slice(i).join(', '), 'area');
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

export async function nominatimOnce(q: string): Promise<{ lat: number; lng: number; display: string } | null> {
  const key = q.trim().toLowerCase();
  // token bucket: min 550ms between Nominatim calls
  const wait = 550 - (Date.now() - lastCall);
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
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, display: r.display_name || q };
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

async function nominatim(
  q: string,
  anchorCity?: string | null,
  farGuard?: (lat: number, lng: number) => boolean,
): Promise<{ lat: number; lng: number; display: string; precision: 'address' | 'area' } | null> {
  for (const c of candidates(q, anchorCity)) {
    const key = transliterate(c.text).toLowerCase();
    const hit = geoCache.get(key);
    if (hit && Date.now() - hit.t < 15_000) return { lat: hit.lat, lng: hit.lng, display: hit.display, precision: hit.precision };
    const missed = geoMiss.get(key);
    if (missed && Date.now() - missed < 15_000) continue;
    const r = await nominatimOnce(c.text);
    if (r) {
      if (farGuard && farGuard(r.lat, r.lng)) {
        geoMiss.set(key, Date.now()); // suspicious — keep trying
        if (geoMiss.size > 200) geoMiss.delete(geoMiss.keys().next().value as string);
        continue;
      }
      geoCache.set(key, { t: Date.now(), lat: r.lat, lng: r.lng, display: r.display, precision: c.precision });
      if (geoCache.size > 200) geoCache.delete(geoCache.keys().next().value as string);
      geoMiss.delete(key);
      return { ...r, precision: c.precision };
    }
    geoMiss.set(key, Date.now());
    if (geoMiss.size > 200) geoMiss.delete(geoMiss.keys().next().value as string);
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
    const noPlaceToken = !detectPlace(q);
    const farGuard = noPlaceToken
      ? (lat: number, lng: number) => haversineKm(vLat, vLng!, lat, lng) > FAR_HIT_KM
      : undefined;
    let c = await nominatim(q, null, farGuard);
    if (!c && noPlaceToken) {
      // 11s: input names no AZ place token ("Nizami Cəfərov 12") → retry
      // anchored on the venue's own city ("Nizami Cəfərov 12, Bakı").
      const anchor = await venueCityOf(vLat, vLng!);
      if (anchor) c = await nominatim(q, anchor, farGuard);
    }
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
