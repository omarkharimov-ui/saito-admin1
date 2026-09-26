import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    // 2026-09-24 (Delivery Phase 1): two overloads share the name —
    //   legacy (p_zone_name, p_order_amount, p_customer_address)  [frozen]
    //   distance (p_zone_name, p_order_amount, p_distance_km)     [new]
    // PostgREST resolves overloads by parameter NAME, so we dispatch on which
    // key the caller sent (never both).
    const isDistance = body.p_distance_km !== undefined && body.p_distance_km !== null && body.p_distance_km !== '';
    const args = isDistance
      ? {
          p_zone_name: body.p_zone_name || null,
          p_order_amount: body.p_order_amount || 0,
          p_distance_km: Number(body.p_distance_km),
        }
      : {
          p_zone_name: body.p_zone_name || null,
          p_order_amount: body.p_order_amount || 0,
          p_customer_address: body.p_customer_address || null,
        };
    const { data, error } = await supabase.rpc('calculate_delivery_fee', args);

    if (error) {
      console.error('[calculate_delivery_fee] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2026-09-26 (owner, Task 55): SMART SURGE — Wolt-class dynamic pricing.
    // The RPC fee = zone/distance base × MANUAL multiplier (settings).
    // On top: MAX(weather-surge, peak-surge) — operator-configured, no
    // hardcoded values, no stacking (same ceiling behavior as Wolt's
    // "demand pricing" badge). Every input is live: Open-Meteo current
    // precipitation/weather code (10-min cache) + venue-timezone peak
    // windows (S-05) from settings.
    const out = await applySmartSurge(data, supabase);
    return NextResponse.json(out);
  } catch (e: any) {
    console.error('[calculate_delivery_fee] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── smart surge (weather + peak) — server-side, cached ─────────────────────

interface SurgeInfo { mult: number; reason: 'weather' | 'peak' | null; }

let settingsCache: { t: number; s: any } | null = null;
let venueCache: { t: number; v: { lat: number | null; lng: number | null; tz: string | null } } | null = null;
let weatherCache: { t: number; raining: boolean } | null = null;

async function getSmartSurge(supabase: any): Promise<SurgeInfo> {
  try {
    // settings (60s cache)
    if (!settingsCache || Date.now() - settingsCache.t > 60_000) {
      const { data: sRows } = await supabase.from('settings').select('delivery_weather_surge_enabled, delivery_weather_surge_multiplier, delivery_peak_surge_enabled, delivery_peak_surge_multiplier, delivery_peak_start_hour, delivery_peak_end_hour, delivery_peak2_start_hour, delivery_peak2_end_hour').limit(1);
      settingsCache = { t: Date.now(), s: (sRows || [])[0] || {} };
    }
    const s = settingsCache.s;

    // peak window (venue timezone — S-05: business hour in location tz)
    if (s.delivery_peak_surge_enabled) {
      let h = new Date().getHours();
      try {
        if (venueCache?.v?.tz) {
          h = parseInt(new Date().toLocaleString('en-GB', { timeZone: venueCache.v.tz, hour: '2-digit', hour12: false }), 10) % 24;
        }
      } catch { /* server tz */ }
      const inWin = (a: any, b: any) => {
        const start = Number(a) || 0, end = Number(b) || 24;
        return end > start ? (h >= start && h < end) : (h >= start || h < end); // wrap = overnight
      };
      const peak = inWin(s.delivery_peak_start_hour, s.delivery_peak_end_hour)
        || inWin(s.delivery_peak2_start_hour, s.delivery_peak2_end_hour);
      if (peak) return { mult: Math.min(3, Math.max(1, Number(s.delivery_peak_surge_multiplier) || 1.25)), reason: 'peak' };
    }

    // weather (10-min cache) — Open-Meteo, no key
    if (s.delivery_weather_surge_enabled) {
      if (!venueCache || Date.now() - venueCache.t > 60_000) {
        const { data: lRows } = await supabase.from('locations').select('latitude, longitude, timezone').eq('is_active', true).limit(1);
        const l = (lRows || [])[0];
        venueCache = { t: Date.now(), v: { lat: l?.latitude != null ? Number(l.latitude) : null, lng: l?.longitude != null ? Number(l.longitude) : null, tz: l?.timezone || null } };
      }
      const v = venueCache.v;
      if (v.lat != null && v.lng != null) {
        if (!weatherCache || Date.now() - weatherCache.t > 10 * 60_000) {
          try {
            const w = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lng}&current=precipitation,weather_code`,
              { headers: { 'User-Agent': 'SaitoPOS/1.0 (delivery surge)' } },
            );
            const j = await w.json();
            const cur = j?.current;
            const raining = Number(cur?.precipitation) >= 0.5 || Number(cur?.weather_code) >= 51;
            weatherCache = { t: Date.now(), raining };
          } catch {
            weatherCache = { t: Date.now() - 9 * 60_000, raining: false }; // retry sooner
          }
        }
        if (weatherCache.raining) {
          return { mult: Math.min(3, Math.max(1, Number(s.delivery_weather_surge_multiplier) || 1.5)), reason: 'weather' };
        }
      }
    }
  } catch { /* surge is best-effort — base fee still valid */ }
  return { mult: 1, reason: null };
}

async function applySmartSurge(data: any, supabase: any): Promise<any> {
  // The RPC may return a plain number (legacy) or a jsonb object.
  const isObj = data !== null && typeof data === 'object' && !Array.isArray(data);
  const baseFee = isObj ? Number((data as any).fee) || 0 : Number(data) || 0;
  const isFree = isObj ? !!(data as any).is_free : false;
  if (!isObj || baseFee <= 0 || isFree) return data; // free delivery / legacy: untouched

  const { mult, reason } = await getSmartSurge(supabase);
  if (mult <= 1 || !reason) return data;

  return {
    ...(data as any),
    fee: Math.round(baseFee * mult * 100) / 100,
    base_fee: baseFee,
    smart_surge: mult,
    smart_surge_reason: reason,
  };
}