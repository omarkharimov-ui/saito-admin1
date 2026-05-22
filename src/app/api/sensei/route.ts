import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';

export async function POST(request: Request) {
  try {
    const { productName, ingredients, language } = await request.json();
    const name = typeof productName === 'string' ? productName.trim() : '';
    if (!name) return NextResponse.json({ error: 'Missing product name' }, { status: 400 });

    const lang = language === 'en' || language === 'ru' ? language : 'az';
    const ingr = typeof ingredients === 'string' ? ingredients.trim() : '';

    const description = await groqChat(
      `Write a short appetizing menu description (max 150 characters) for a sushi restaurant. Language: ${lang}. Return ONLY the description text.`,
      `Product: ${name}${ingr ? `\nIngredients: ${ingr}` : ''}`,
      { maxTokens: 120, temperature: 0.5 }
    );

    if (!description) {
      return NextResponse.json({ error: 'Sensei unavailable' }, { status: 503 });
    }

    return NextResponse.json({ description: description.slice(0, 150) });
  } catch {
    return NextResponse.json({ error: 'Sensei failed' }, { status: 500 });
  }
}
