import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const runtime = 'nodejs';

/**
 * AI Cookbook Parser
 * Bütün bir resept kitabını (PDF) parse edir, bütün reseptləri çıxarır.
 * Hər reseptə uyğun məhsul və xəmmalları təklif edir.
 */
export async function POST(request: Request) {
  try {
    let text = '';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (file && file.size > 0) {
        const pdfParse = require('pdf-parse');
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        text = pdfData.text || '';
      }
    } else {
      const body = await request.json();
      text = body.text || '';
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'PDF or text required' }, { status: 400 });
    }

    // DB-dəki məlumatları çək
    const [{ data: dbIngredients }, { data: dbProducts }] = await Promise.all([
      supabase.from('ingredients').select('id, name, unit'),
      supabase.from('products').select('id, name, name_az, name_en, name_ru'),
    ]);

    const ingredientNames = (dbIngredients || []).map((i: any) => `${i.name} (${i.unit})`).join(', ');
    const productNames = (dbProducts || []).map((p: any) => {
      const names = [p.name_az, p.name_en, p.name_ru, p.name].filter(Boolean);
      return `${p.id}:${names.join('|')}`;
    }).join(', ');

    // Çox böyük PDF-lər üçün truncate (128K context limit nəzərə alınaraq)
    const MAX_TEXT_LENGTH = 120000;
    const truncated = text.length > MAX_TEXT_LENGTH;
    const cookbookText = text.slice(0, MAX_TEXT_LENGTH);

    const aiResponse = await groqChat(
      `You are a restaurant cookbook parser. Extract ALL recipes from the following cookbook text.
Return ONLY a JSON object with NO other text.

For each recipe, include:
- recipeName: the exact name as written in the book
- suggestedProductId: the most likely matching product ID from this list, or null if no good match: ${productNames}
- suggestedProductName: the matched product name or null
- ingredients: array of {name, quantity, unit} using ONLY these known ingredients: ${ingredientNames}
- confidence: number 0-1 for how confident you are in the product match

Format:
{"recipes":[{"recipeName":"...","suggestedProductId":"uuid-or-null","suggestedProductName":"...","ingredients":[{"name":"...","quantity":number,"unit":"gram|piece|ml"}],"confidence":0.8}]}

Important: Extract EVERY recipe you find. Do not skip any. If text is truncated, extract all complete recipes from the available text.`,
      `Cookbook text${truncated ? ' (truncated)' : ''}:\n${cookbookText}`,
      { maxTokens: 16000, temperature: 0.2 }
    );

    // JSON parse
    let parsedData: { recipes?: any[] } = {};
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsedData = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: 'AI parse failed', raw: aiResponse.slice(0, 500) }, { status: 422 });
    }

    if (!parsedData.recipes || parsedData.recipes.length === 0) {
      return NextResponse.json({ error: 'No recipes found', raw: aiResponse.slice(0, 500) }, { status: 422 });
    }

    // Match ingredients with DB IDs
    const results = [];
    for (const recipe of parsedData.recipes) {
      const matchedIngredients = [];
      for (const ing of (recipe.ingredients || [])) {
        const matched = (dbIngredients || []).find(
          (i: any) => i.name.toLowerCase().includes(ing.name.toLowerCase())
            || ing.name.toLowerCase().includes(i.name.toLowerCase())
        );
        if (matched) {
          matchedIngredients.push({
            ingredient_id: matched.id,
            ingredient_name: matched.name,
            quantity_required: ing.quantity,
            unit: matched.unit,
          });
        }
      }

      const productExists = (dbProducts || []).find((p: any) => p.id === recipe.suggestedProductId);

      results.push({
        recipeName: recipe.recipeName,
        suggestedProductId: productExists ? recipe.suggestedProductId : null,
        suggestedProductName: productExists ? recipe.suggestedProductName : null,
        confidence: recipe.confidence || 0,
        ingredients: matchedIngredients,
        unmatchedIngredients: (recipe.ingredients || []).length - matchedIngredients.length,
      });
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      truncated,
      recipes: results,
    });
  } catch (error: any) {
    console.error('[parse-cookbook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
