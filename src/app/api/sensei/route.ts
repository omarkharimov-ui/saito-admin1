import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';

export async function POST(request: Request) {
  try {
    const { productName, ingredients, language } = await request.json();
    const name = typeof productName === 'string' ? productName.trim() : '';
    if (!name) return NextResponse.json({ error: 'Missing product name' }, { status: 400 });

    const lang = language === 'en' || language === 'ru' ? language : 'az';
    const ingr = typeof ingredients === 'string' ? ingredients.trim() : '';

    const prompt = `You are a menu creator for a sushi restaurant. Given a product name, generate:
1. A short appetizing description (max 150 chars)
2. A comma-separated list of ingredients
3. A suggested category type (drink/dessert/food)

Return ONLY valid JSON:
{"description":"...", "ingredients":"...", "category_type":"food|drink|dessert"}`;

    const result = await groqChat(
      prompt,
      `Product: ${name}${ingr ? `\nExisting ingredients: ${ingr}` : ''}\nLanguage: ${lang}`,
      { maxTokens: 250, temperature: 0.5 }
    );

    if (!result) {
      return NextResponse.json({ error: 'Sensei unavailable' }, { status: 503 });
    }

    let parsed;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { parsed = null; }

    return NextResponse.json({
      description: parsed?.description?.slice(0, 150) || result.slice(0, 150),
      ingredients: parsed?.ingredients || '',
      category_type: parsed?.category_type || 'food',
    });
  } catch {
    return NextResponse.json({ error: 'Sensei failed' }, { status: 500 });
  }
}
