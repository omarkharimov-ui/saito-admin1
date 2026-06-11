import { NextRequest, NextResponse } from 'next/server';
import { groqChat, parseJsonFromText } from '@/lib/groq';
import type { NormalizedRecipeIngredient } from '@/types/recipes';

interface SuggestionResponse {
  recipe: NormalizedRecipeIngredient[];
}

export async function GET(req: NextRequest) {
  const dishName = req.nextUrl.searchParams.get('dishName')?.trim();
  if (!dishName) {
    return NextResponse.json({ suggestions: [] });
  }

  const system = `Sən professional aşbazsan. Verilən yeməyin adına əsasən inqrediyentləri və miqdarlarını təxmin et.  

Qaydalar:
- Hər inqrediyent üçün netto miqdar ver (soyuq itkidən əvvəl).
- Miqdarları 1 porsiya üçün hesabla.
- Mümkün qədər dəqiq ol: un, yağ, ət, tərəvəz, ədviyyatlar.
- Əgər yeməyi bilmirsənsə, ən çox istifadə olunan inqrediyentlərlə ən yaxın variantı təklif et.
- Yalnız JSON formatında cavab ver, başqa heç nə yazma:

{"recipe":[{"ingredientName":"string","quantity":number,"unit":"gram|piece|ml","note?":"string"}]}`;

  const user = `Yemək adı: "${dishName}". Bu yemək üçün lazım olan inqrediyentləri və miqdarlarını təklif et.`;

  const raw = await groqChat(system, user, { maxTokens: 800, temperature: 0.3 });
  if (!raw) {
    return NextResponse.json({ suggestions: [] });
  }

  const parsed = parseJsonFromText<SuggestionResponse>(raw);
  if (!parsed?.recipe || !Array.isArray(parsed.recipe)) {
    return NextResponse.json({ suggestions: [] });
  }

  return NextResponse.json({ suggestions: parsed.recipe });
}
