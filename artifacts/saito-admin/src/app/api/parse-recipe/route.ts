import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';
import { createClient } from '@supabase/supabase-js';
import type { NormalizedRecipeIngredient } from '@/types/recipes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const runtime = 'nodejs';

/**
 * AI Recipe Document Parser
 * PDF, Word və ya TXT formatında gələn resept sənədini parse edir.
 *
 * Body (multipart/form-data): { file: File, productId: string }
 * Body (json): { text: string, productId: string }
 */
export async function POST(request: Request) {
  try {
    let text = '';
    let productId = '';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      productId = (formData.get('productId') as string) || '';
      const textFromForm = (formData.get('text') as string) || '';

      if (file && file.size > 0) {
        const pdfParse = require('pdf-parse');
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        text = pdfData.text || '';
      }
      if (!text && textFromForm) text = textFromForm;
    } else {
      const body = await request.json();
      text = body.text || '';
      productId = body.productId || '';
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'text or PDF file required' }, { status: 400 });
    }
    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    // 1. DB-dəki ingredient-ləri çək
    const { data: dbIngredients } = await supabase
      .from('ingredients')
      .select('id, name, unit');

    const ingredientNames = (dbIngredients || []).map((i: any) => `${i.name} (${i.unit})`).join(', ');

    // 2. Groq AI ilə resept mətnini parse et
    const aiResponse = await groqChat(
      `Sən bir restoran resept parserisən. Sənə verilən resept mətnindən xəmmal adlarını və miqdarlarını çıxarır və JSON olaraq qaytarırsan.

Mövcud anbar xəmmalları: ${ingredientNames}

Yalnız mövcud xəmmallardan istifadə et. Yalnız JSON qaytar, başqa heç nə yazma:
{"recipe":[{"ingredientName":"string","quantity":number,"unit":"gram|piece|ml"}]}`,
      `Resept mətni:\n${text}`,
      { maxTokens: 1200, temperature: 0.2 }
    );

    // 3. JSON parse et
    let recipeData: { recipe?: { ingredientName: string; quantity: number; unit: string }[] } = {};
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) recipeData = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: 'AI cavabı parse edilə bilmədi', raw: aiResponse }, { status: 422 });
    }

    if (!recipeData.recipe || recipeData.recipe.length === 0) {
      return NextResponse.json({ error: 'Resept tapılmadı' }, { status: 422 });
    }

    // 4. Ingredient-ləri DB-dəki ID-lərlə match et
    const matchedRecipe: NormalizedRecipeIngredient[] = [];
    for (const r of recipeData.recipe) {
      const matched = (dbIngredients || []).find(
        (i: any) => i.name.toLowerCase().includes(r.ingredientName.toLowerCase())
          || r.ingredientName.toLowerCase().includes(i.name.toLowerCase())
      );
      if (matched) {
        matchedRecipe.push({
          name: matched.name,
          quantity: r.quantity,
          unit: matched.unit,
        });
      }
    }

    if (matchedRecipe.length === 0) {
      return NextResponse.json({ error: 'Heç bir xəmmal match edilmədi', parsed: recipeData.recipe }, { status: 422 });
    }

    // 5. Köhnə AI reseptləri sil
    await supabase
      .from('recipes')
      .delete()
      .eq('menu_item_id', productId)
      .eq('is_ai_suggested', true);

    // 6. Yeni AI reseptini yaz
    for (const r of matchedRecipe) {
      await supabase.from('recipes').insert({
        menu_item_id: productId,
        ingredient_id: (r as any).ingredient_id,
        quantity_required: (r as any).quantity_required,
        is_ai_suggested: true,
      });
    }

    // 7. Product-u AI reseptli et
    await supabase
      .from('products')
      .update({ has_active_recipe: true })
      .eq('id', productId);

    return NextResponse.json({
      success: true,
      productId,
      matchedCount: matchedRecipe.length,
      recipe: matchedRecipe,
    });
  } catch (error: any) {
    console.error('[parse-recipe] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
