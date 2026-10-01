import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

// ============================================================================
// 2026-10-01 (11s, owner): "weather api brauzerden elde et, tənzimləmələr
// üçün" — OWM hesabı Chrome-da yox idi (sessiya yoxdur, qeydiyyat e-mail
// tələb edir). Keyless fallback: Open-Meteo (eyni servisi calculate_delivery
// fee artıq işlədir — heç bir API key YOX). OWM key-i vardırsa HƏMİŞƏ o
// üstünlük alır (OPENWEATHER_API_KEY / NEXT_PUBLIC_OPENWEATHER_API_KEY).
//
// Consumer: admin/layout.tsx → data-weather attribute (foundation.css
// [data-weather='sunny'] theme). BUNA GÖRƏ condition qıymətləri OWM
// "main"-dən fərqli, CSS-in gözlədiyi dəstə normalize olunur:
//   sunny | partly-cloudy | cloudy | mist | rain | snow | thunderstorm
// ============================================================================

// AZ place variants (folded: ə→e, ı→i, lowercase) → canonical city + coords.
const CITIES: { name: string; lat: number; lng: number; variants: string[] }[] = [
  { name: 'Bakı', lat: 40.4093, lng: 49.8671, variants: ['baku', 'baki'] },
  { name: 'Sumqayıt', lat: 40.6145, lng: 49.7367, variants: ['sumqayit', 'sumgayt', 'sumgait'] },
  { name: 'Gəncə', lat: 40.7335, lng: 46.4529, variants: ['genca', 'gence', 'ganja'] },
  { name: 'Mingəçevir', lat: 40.6813, lng: 47.1779, variants: ['mingechevir', 'mingecevir'] },
  { name: 'Xırdalar', lat: 40.6355, lng: 50.165, variants: ['xirdalar', 'xirdalan'] },
  { name: 'Sabunçu', lat: 40.5548, lng: 50.2804, variants: ['sabunchu', 'sabunclu'] },
  { name: 'Şamaxı', lat: 41.4749, lng: 48.4783, variants: ['shamaki', 'shamaxi', 'shamahi'] },
  { name: 'Salyan', lat: 40.0915, lng: 48.8692, variants: ['salyan', 'shalyan'] },
  { name: 'Lənkəran', lat: 38.6628, lng: 49.3206, variants: ['lenkeran', 'lankaran'] },
  { name: 'Şəki', lat: 41.8124, lng: 47.798, variants: ['sheki', 'shaki'] },
  { name: 'Quba', lat: 41.6372, lng: 48.7335, variants: ['quba', 'kuba'] },
  { name: 'Yevlax', lat: 40.9432, lng: 47.9568, variants: ['yevlax', 'evlakh'] },
];
function foldCity(s: string): string {
  return s.toLowerCase().replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
}
function resolveCity(city: string): { name: string; lat: number; lng: number } | null {
  const key = foldCity(city);
  const found = CITIES.find(c => c.variants.includes(key) || foldCity(c.name) === key);
  return found ? { name: found.name, lat: found.lat, lng: found.lng } : null;
}

// Open-Meteo weather_code → theme condition (foundation.css 'sunny' + set).
function omCondition(code: number): { condition: string; description: string } {
  if (code <= 1) return { condition: 'sunny', description: 'Açıq hava' };
  if (code === 2) return { condition: 'partly-cloudy', description: 'Qismən buludlu' };
  if (code === 3) return { condition: 'cloudy', description: 'Buludlu' };
  if (code === 45 || code === 48) return { condition: 'mist', description: 'Sis' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { condition: 'rain', description: 'Yağışlı' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { condition: 'snow', description: 'Qarlı' };
  if (code >= 95) return { condition: 'thunderstorm', description: 'Şimşəkli tufan' };
  return { condition: 'cloudy', description: 'Dəyişkən hava' };
}

export async function GET(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const city = url.searchParams.get('city') || 'Baku';

    const apiKey = process.env.OPENWEATHER_API_KEY || process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;

    if (apiKey) {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`,
        { next: { revalidate: 300 } }, // 5 min cache
      );
      if (!res.ok) throw new Error('Weather API failed');
      const data = await res.json();
      return NextResponse.json({
        city: data.name,
        temp: Math.round(data.main.temp),
        condition: data.weather[0].main,
        description: data.weather[0].description,
      });
    }

    // ── keyless fallback: Open-Meteo (no API key, 5 min cache) ──────────────
    const c = resolveCity(city);
    if (!c) return NextResponse.json({ disabled: true, city, reason: 'unknown_city' });

    const omRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lng}&current=temperature_2m,apparent_temperature,weather_code,precipitation`,
      { next: { revalidate: 300 } },
    );
    if (!omRes.ok) throw new Error('Open-Meteo API failed');
    const om = await omRes.json();
    const cur = om?.current;
    if (!cur) throw new Error('Open-Meteo: empty current block');

    const mapped = omCondition(Number(cur.weather_code));
    return NextResponse.json({
      city: c.name,
      temp: Math.round(Number(cur.temperature_2m)),
      feels_like: Math.round(Number(cur.apparent_temperature)),
      precipitation: Number(cur.precipitation) || 0,
      condition: mapped.condition,
      description: mapped.description,
      source: 'open-meteo',
    });
  } catch (e: any) {
    console.error('[Weather API] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
