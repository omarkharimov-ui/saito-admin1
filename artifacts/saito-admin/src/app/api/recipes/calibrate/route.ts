import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { groqChat, parseJsonFromText } from '@/lib/groq';

// 13c (strengthened calibration — the owner's "our AI is better than theirs"
// line): the old calibration was a static theoretical_stock variance from a
// view. Now it is a real LLM review per product: 30-day theoretical demand
// (recipe × sold units) vs ACTUAL consumption (per-item logs), and the model
// proposes a BOM delta. The UI shows the diff and applies it via the atomic
// /api/recipes/save — nothing writes here (propose-only, human approves).
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const productId = new URL(request.url).searchParams.get('product_id');
    if (!productId) return NextResponse.json({ error: 'product_id tələb olunur' }, { status: 400 });

    const supabase = svc();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const [prodRes, recipeRes, salesRes, logRes] = await Promise.all([
      supabase.from('products').select('id, name, price').eq('id', productId).single(),
      supabase
        .from('recipes')
        .select('id, ingredient_id, quantity_required, is_ai_suggested, ingredient:ingredients(name, unit, current_stock, average_cost_per_unit)')
        .eq('menu_item_id', productId),
      supabase.from('order_items').select('quantity').eq('product_id', productId).gte('created_at', sinceIso),
      supabase
        .from('inventory_logs')
        .select('ingredient_id, quantity, order_item_id')
        .eq('type', 'order_consumption')
        .gte('created_at', sinceIso)
        .not('order_item_id', 'is', null),
    ]);
    if (prodRes.error) throw prodRes.error;
    const product: any = prodRes.data;
    const recipes: any[] = recipeRes.data ?? [];
    if (recipes.length === 0) {
      return NextResponse.json({ product_id: productId, product_name: product?.name, sales_30d: 0, rows: [], suggestions: [], ai: 'no_recipe' });
    }

    // Actual consumption attributed to THIS product: logs whose order_item_id
    // belongs to one of the product's sold items (30d).
    const { data: soldItems } = await supabase
      .from('order_items').select('id').eq('product_id', productId).gte('created_at', sinceIso);
    const soldItemIds = new Set((soldItems ?? []).map((s: any) => s.id));
    const actualByIng: Record<string, number> = {};
    for (const l of logRes.data ?? []) {
      if (!soldItemIds.has(l.order_item_id)) continue;
      actualByIng[l.ingredient_id] = (actualByIng[l.ingredient_id] || 0) + Math.abs(Number(l.quantity) || 0);
    }

    const soldUnits = (salesRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
    const rows = recipes.map((r: any) => {
      const qty = Number(r.quantity_required) || 0;
      const theoretical = Math.round(soldUnits * qty * 100) / 100;
      const actual = Math.round((actualByIng[r.ingredient_id] || 0) * 100) / 100;
      return {
        ingredient_id: r.ingredient_id,
        name: r.ingredient?.name || 'Naməlum',
        unit: r.ingredient?.unit || '',
        bom_qty: qty,
        sold_units: soldUnits,
        theoretical,
        actual,
        variance: Math.round((actual - theoretical) * 100) / 100,
        variance_pct: theoretical > 0 ? Math.round(((actual - theoretical) / theoretical) * 1000) / 10 : null,
        stock: r.ingredient?.current_stock ?? null,
        ai_suggested: r.is_ai_suggested,
      };
    });

    // ── LLM review (propose-only) ──────────────────────────────────────────
    let suggestions: any[] = [];
    if (soldUnits > 0) {
      const prompt = [
        `Məhsul: ${product.name} (30 gündə ${soldUnits} ədəd satılıb).`,
        `İndiki resept (BOM) və faktiki sərfiyyat (ingredient | BOM miqdar | təxmin olunan 30g sərf | FAKTİKİ sərf):`,
        rows.map((r) => `${r.name} [${r.unit}] | ${r.bom_qty} | ${r.theoretical} | ${r.actual}`).join('\n'),
        '',
        'Faktiki sərfiyyat təxmindən 10%-dən çox fərqlənirsə, resept üçün təklif ver. Yalnız dəqiq, kiçik düzəlişlər (məs. 150 → 140). Zəif/itki (waste) fərqi reseptə əlavə etmə — o ayrıca ölçülür.',
        'STRICT JSON cavab (heç bir başqa text YOX):',
        '{"suggestions":[{"ingredient_id":"...","name":"...","current_qty":150,"suggested_qty":140,"reason":"kısa AZ səbəb"}]}',
        'Təklif yoxdursa: {"suggestions":[]}',
      ].join('\n');
      const aiText = await groqChat(
        'Sən restoran resept kalibratordurusan. Cavabı YALNIZ valid JSON kimi ver.',
        prompt,
        { maxTokens: 900, temperature: 0.2 }
      );
      const parsed = parseJsonFromText<{ suggestions?: any[] }>(aiText);
      if (parsed?.suggestions) {
        const idSet = new Set(rows.map((r) => r.ingredient_id));
        suggestions = parsed.suggestions
          .filter((s) => idSet.has(s.ingredient_id) && Number(s.suggested_qty) > 0)
          .map((s) => ({ ...s, suggested_qty: Math.round(Number(s.suggested_qty) * 100) / 100 }));
      }
    }

    return NextResponse.json({
      product_id: productId,
      product_name: product?.name,
      price: product?.price,
      sales_30d: soldUnits,
      rows,
      suggestions,
      ai: soldUnits > 0 ? 'ok' : 'no_sales',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
