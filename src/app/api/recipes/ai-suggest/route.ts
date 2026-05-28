import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { groqChat } from '@/lib/groq';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * AI Predictive Recipe Suggestion
 * 
 * Məntiq:
 * 1. Resepti olmayan məhsulları tap (has_active_recipe = false, is_ready_product = false)
 * 2. Hər məhsul üçün son 7 gündəki satış miqdarını hesabla
 * 3. Son 7 gündəki inventory consumption (waste + order_consumption) topla
 * 4. Groq AI-ya ver: "Bu yeməyin adı Dragon Roll, son 7 gündə 15 ədəd satılıb.
 *    Anbarda bu müddətdə 1.2kg somon, 800g düyü, 15 ədəd nori azalıb.
 *    Bu yeməyin ehtimal reseptini JSON olaraq ver."
 * 5. AI cavabını recipes cədvəlinə is_ai_suggested = true olaraq yaz
 */
export async function POST() {
  try {
    // 1. Resepti olmayan məhsulları tap
    const { data: products } = await supabase
      .from('products')
      .select('id, name, name_az, price')
      .eq('has_active_recipe', false)
      .eq('is_ready_product', false)
      .order('name_az');

    if (!products || products.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // 2. Son 7 gündəki satışlar
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sales } = await supabase
      .from('order_items')
      .select('product_id, quantity, product_name')
      .eq('orders.status', 'paid')
      .gte('orders.created_at', sevenDaysAgo)
      .order('product_id');

    // 3. Son 7 gündəki inventory consumption
    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, type, ingredient:ingredients(name, unit)')
      .in('type', ['order_consumption', 'waste'])
      .gte('created_at', sevenDaysAgo);

    // Satışları product_id görə qrupla
    const salesByProduct: Record<string, { totalSold: number; productName: string }> = {};
    for (const s of sales || []) {
      const pid = s.product_id;
      if (!pid) continue;
      if (!salesByProduct[pid]) {
        salesByProduct[pid] = { totalSold: 0, productName: s.product_name || '' };
      }
      salesByProduct[pid].totalSold += Number(s.quantity) || 0;
    }

    // Ingredient consumption-u qrupla
    const ingredientConsumption: Record<string, { total: number; name: string; unit: string }> = {};
    for (const log of logs || []) {
      const iid = log.ingredient_id;
      if (!iid) continue;
      const name = (log.ingredient as any)?.name || '';
      const unit = (log.ingredient as any)?.unit || '';
      if (!ingredientConsumption[iid]) {
        ingredientConsumption[iid] = { total: 0, name, unit };
      }
      ingredientConsumption[iid].total += Number(log.quantity) || 0;
    }

    // 4. Hər məhsul üçün AI-ya sorğu göndər
    const suggestions: any[] = [];

    for (const product of products) {
      const salesInfo = salesByProduct[product.id];
      const totalSold = salesInfo?.totalSold || 0;

      // Əgər heç satılmayıbsa skip
      if (totalSold < 1) continue;

      // Məhsulun adını tap
      const productName = (product as any).name_az || product.name;

      // AI prompt
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

      // JSON parse et
      let recipeData: { recipe?: { ingredientName: string; quantity: number; unit: string }[] } = {};
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          recipeData = JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.error('[ai-suggest] JSON parse failed for', productName);
        continue;
      }

      if (!recipeData.recipe || recipeData.recipe.length === 0) continue;

      // Ingredient-ləri DB-dəki ID-lərlə match et
      const { data: dbIngredients } = await supabase
        .from('ingredients')
        .select('id, name, unit');

      const matchedRecipe = [];
      for (const r of recipeData.recipe) {
        const matched = (dbIngredients || []).find(
          (i: any) => i.name.toLowerCase().includes(r.ingredientName.toLowerCase())
            || r.ingredientName.toLowerCase().includes(i.name.toLowerCase())
        );
        if (matched) {
          matchedRecipe.push({
            ingredient_id: matched.id,
            ingredient_name: matched.name,
            quantity_required: r.quantity,
            unit: matched.unit,
          });
        }
      }

      if (matchedRecipe.length === 0) continue;

      suggestions.push({
        product_id: product.id,
        product_name: productName,
        total_sold: totalSold,
        recipe: matchedRecipe,
      });

      // AI reseptini recipes cədvəlinə yaz (is_ai_suggested = true)
      for (const r of matchedRecipe) {
        await supabase.from('recipes').insert({
          menu_item_id: product.id,
          ingredient_id: r.ingredient_id,
          quantity_required: r.quantity_required,
          is_ai_suggested: true,
        });
      }

      // products.has_active_recipe = true et (AI resept var, amma təsdiq gözləyir)
      await supabase.from('products').update({ has_active_recipe: true }).eq('id', product.id);
    }

    return NextResponse.json({ suggestions, count: suggestions.length });
  } catch (error: any) {
    console.error('[ai-suggest] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
