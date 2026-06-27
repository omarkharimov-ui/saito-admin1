import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';
import { validateAuth } from '@/lib/api-auth';

export async function POST(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { name, language } = await request.json();
    const raw = typeof name === 'string' ? name.trim() : '';
    if (!raw) return NextResponse.json({ corrected: '' });

    const lang = language === 'en' || language === 'ru' ? language : 'az';
    const corrected = await groqChat(
      `You fix restaurant menu item names. Language: ${lang}. Return ONLY the corrected name, no quotes or explanation.`,
      raw,
      { maxTokens: 80, temperature: 0.1 }
    );

    return NextResponse.json({ corrected: corrected || raw });
  } catch {
    return NextResponse.json({ corrected: '' }, { status: 500 });
  }
}
