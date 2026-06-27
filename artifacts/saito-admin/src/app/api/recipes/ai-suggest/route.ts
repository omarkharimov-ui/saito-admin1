import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { groqChat } from '@/lib/groq';
import type { InventoryLog, ProductCatalogItem } from '@/types/inventory';
import type { NormalizedRecipeIngredient, NormalizedRecipeSuggestion } from '@/types/recipes';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Per-product mode (body: { productId: string }):
 * - Yalnız həmin məhsul üçün təklif ver, DB-yə YAZMA
 */

async function suggestForProduct(productId: string, productName: string, totalSold: number, ingredientConsumption: Record<string, { total: number; name: string; unit: string }>) {
  const ingredientList = Object.values(ingredientConsumption)
    .filter(i => i.total > 0)
    .map(i => `- ${i.name}: ${i.total.toFixed(2)} ${i.unit}`)
    .join('\n');

  const prompt = `Restoran resept təxmini. Məhsul: "${productName}". Son 7 gündə ${totalSold} ədəd satılıb.

Anbarda ümumi azalmalar:\n${ingredientList || '(məlumat yoxdur)'}

Bu məhsulun ehtimal reseptini çıxar. Hər ingredient üçün miqdar ver. Əgər bilirsən yeməyin nə olduğunu, real resept ver. Yalnız JSON qaytar, başqa söz yox:
{"recipe":[{"ingredientName":"string","quantity":number,"unit":"gram|piece|ml"}]}`;

  const aiResponse = await groqChat(
    'Sən bir restoran aşbazı və data analitiksisən. Sənə verilən satış məlumatlarına əsasən yeməyin ehtimal reseptini çıxarırsan. Yalnız JSON cavab ver.',
    prompt,
    { maxTokens: 800, temperature: 0.3 }
  );

  let recipeData: { recipe?: Array<{ ingredientName: string; quantity: number; unit: string }> } = {};
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) recipeData = JSON.parse(jsonMatch[0]);
  } catch {
    console.error('[ai-suggest] JSON parse failed for', productName);
    return null;
  }

  if (!recipeData.recipe || recipeData.recipe.length === 0) return null;

  const supabase = svc();
  const { data: dbIngredients } = await supabase
    .from('ingredients')
    .select('id, name, unit, average_cost_per_unit, cold_waste_percentage');

  const matchedRecipe: Array<NormalizedRecipeIngredient & { ingredient_id: string; ingredient_name: string; quantity_required: number }> = [];
  for (const r of recipeData.recipe) {
    const matched = (dbIngredients || []).find(
      (i: { id: string; name: string; unit: string }) =>
        i.name.toLowerCase().includes(r.ingredientName.toLowerCase()) ||
        r.ingredientName.toLowerCase().includes(i.name.toLowerCase())
    );
    if (matched) {
      matchedRecipe.push({
        ingredient_id: matched.id,
        ingredient_name: matched.name,
        quantity_required: r.quantity,
        name: matched.name,
        quantity: r.quantity,
        unit: matched.unit,
      });
    }
  }

  if (matchedRecipe.length === 0) return null;

  return {
    recipeName: productName,
    suggestedProductId: productId,
    suggestedProductName: productName,
    confidence: 0.7,
    ingredients: matchedRecipe,
    unmatchedIngredients: (recipeData.recipe || []).length - matchedRecipe.length,
    source: 'ai' as const,
  };
}

export async function POST(req: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { productId } = body || {};

    const supabase = svc();
    if (productId) {
      const { data: product } = await supabase
        .from('products')
        .select('id, name, name_az, price')
        .eq('id', productId)
        .single();

      if (!product) {
        return NextResponse.json({ suggestions: [], count: 0 });
      }

      const productName = product.name_az || product.name;

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: logs } = await supabase
        .from('inventory_logs')
        .select('ingredient_id, quantity, type, ingredient:ingredients(name, unit)')
        .in('type', ['order_consumption', 'waste'])
        .gte('created_at', sevenDaysAgo);

      const ingredientConsumption: Record<string, { total: number; name: string; unit: string }> = {};
      for (const log of (logs || []) as any[]) {
        const iid = log.ingredient_id;
        if (!iid) continue;
        const name = log.ingredient?.name || '';
        const unit = log.ingredient?.unit || '';
        if (!ingredientConsumption[iid]) {
          ingredientConsumption[iid] = { total: 0, name, unit };
        }
        ingredientConsumption[iid].total += Number(log.quantity) || 0;
      }

      const result = await suggestForProduct(productId, productName, 0, ingredientConsumption);
      return NextResponse.json({ suggestions: result ? [result] : [], count: result ? 1 : 0 });
    }

    const { data: products } = await supabase
      .from('products')
      .select('id, name, name_az, price')
      .eq('has_active_recipe', false)
      .eq('is_ready_product', false)
      .order('name_az');

    if (!products || products.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sales } = await supabase
      .from('order_items')
      .select('product_id, quantity, product_name')
      .eq('orders.status', 'paid')
      .gte('orders.created_at', sevenDaysAgo)
      .order('product_id');

    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, type, ingredient:ingredients(name, unit)')
      .in('type', ['order_consumption', 'waste'])
      .gte('created_at', sevenDaysAgo);

    const salesByProduct: Record<string, { totalSold: number; productName: string }> = {};
    for (const s of sales || []) {
      const pid = s.product_id;
      if (!pid) continue;
      if (!salesByProduct[pid]) salesByProduct[pid] = { totalSold: 0, productName: s.product_name || '' };
      salesByProduct[pid].totalSold += Number(s.quantity) || 0;
    }

    const ingredientConsumption: Record<string, { total: number; name: string; unit: string }> = {};
    for (const log of (logs || []) as any[]) {
      const iid = log.ingredient_id;
      if (!iid) continue;
      const name = log.ingredient?.name || '';
      const unit = log.ingredient?.unit || '';
      if (!ingredientConsumption[iid]) ingredientConsumption[iid] = { total: 0, name, unit };
      ingredientConsumption[iid].total += Number(log.quantity) || 0;
    }

    const suggestions: NormalizedRecipeSuggestion[] = [];

    for (const product of products as ProductCatalogItem[]) {
      const salesInfo = salesByProduct[product.id];
      const totalSold = salesInfo?.totalSold || 0;
      if (totalSold < 1) continue;

      const productName = product.name_az || product.name;
      const result = await suggestForProduct(product.id, productName, totalSold, ingredientConsumption);
      if (!result) continue;

      suggestions.push(result);

      for (const r of (result as any).ingredients) {
        await supabase.from('recipes').insert({
          menu_item_id: product.id,
          ingredient_id: r.ingredient_id,
          quantity_required: r.quantity_required,
          is_ai_suggested: true,
        });
      }

      // Task 10: AI suggestions should not auto-activate the product recipe.
      // The has_active_recipe will only be set to true when the admin approves the suggestion via /api/recipes/approve.
      // await supabase.from('products').update({ has_active_recipe: true }).eq('id', product.id);
    }

    return NextResponse.json({ suggestions, count: suggestions.length });
  } catch (error: any) {
    console.error('[ai-suggest] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
