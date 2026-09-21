import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const city = url.searchParams.get('city') || 'Baku';
    
    const apiKey = process.env.OPENWEATHER_API_KEY || process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
    
    if (!apiKey) {
      // QF9: missing API key is a config state, not a server error — 200 +
      // disabled flag so the UI degrades quietly instead of 500ing per page.
      return NextResponse.json({ disabled: true, city });
    }
    
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`,
      { next: { revalidate: 300 } } // 5 min cache
    );
    
    if (!res.ok) {
      throw new Error('Weather API failed');
    }
    
    const data = await res.json();
    
    return NextResponse.json({
      city: data.name,
      temp: Math.round(data.main.temp),
      condition: data.weather[0].main,
      description: data.weather[0].description,
    });
  } catch (e: any) {
    console.error('[Weather API] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
