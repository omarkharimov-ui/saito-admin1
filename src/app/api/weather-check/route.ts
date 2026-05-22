import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const city = url.searchParams.get('city') || 'Baku';
    
    const apiKey = process.env.OPENWEATHER_API_KEY || process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
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
