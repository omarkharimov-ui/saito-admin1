import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { DishMarginBreakdown } from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const supabase = svc();

    const { data: products } = await supabase
      .from('products')
      .select('id, name, name_az, price')
      .eq('has_active_recipe', true);

    if (!products?.length) {
      return NextResponse.json({ breakdowns: [], metadata: { total: 0 } });
    }

    const productIds = products.map(p => p.id);

    const { data: recipes } = await supabase
      .from('recipes')
      .select('*, ingredient:ingredient_id(id, name, unit, average_cost_per_unit, purchase_price)')
      .in('menu_item_id', productIds)
      .eq('is_ai_suggested', false);

    if (!recipes?.length) {
      return NextResponse.json({ breakdowns: [], metadata: { total: products.length, with_recipes: 0 } });
    }

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const { data: orders } = await supabase
      .from('order_items')
      .select('product_id, quantity, created_at')
      .in('product_id', productIds)
      .gte('created_at', oneMonthAgo.toISOString());

    const salesByProduct: Record<string, number> = {};
    for (const o of orders || []) {
      salesByProduct[o.product_id] = (salesByProduct[o.product_id] || 0) + (o.quantity || 1);
    }

    const recipeByProduct: Record<string, any[]> = {};
    for (const r of recipes) {
      if (!recipeByProduct[r.menu_item_id]) recipeByProduct[r.menu_item_id] = [];
      recipeByProduct[r.menu_item_id].push(r);
    }

    const breakdowns: DishMarginBreakdown[] = [];

    for (const product of products) {
      const productRecipes = recipeByProduct[product.id] || [];
      if (!productRecipes.length) continue;

      const sellingPrice = product.price || 0;
      let costPrice = 0;
      const costDrivers: { ingredient_name: string; cost_pct: number }[] = [];

      for (const recipe of productRecipes) {
        const ing = recipe.ingredient as any;
        if (!ing) continue;
        const unitCost = ing.average_cost_per_unit || ing.purchase_price || 0;
        const ingCost = recipe.quantity_required * unitCost;
        costPrice += ingCost;
      }

      for (const recipe of productRecipes) {
        const ing = recipe.ingredient as any;
        if (!ing) continue;
        const unitCost = ing.average_cost_per_unit || ing.purchase_price || 0;
        const ingCost = recipe.quantity_required * unitCost;
        if (costPrice > 0) {
          costDrivers.push({
            ingredient_name: ing.name,
            cost_pct: Math.round((ingCost / costPrice) * 10000) / 100,
          });
        }
      }

      costDrivers.sort((a, b) => b.cost_pct - a.cost_pct);

      const marginPct = sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;
      const monthlyUnits = salesByProduct[product.id] || 0;
      const monthlyProfit = monthlyUnits * (sellingPrice - costPrice);

      let optimizationPotential: 'high' | 'medium' | 'low' = 'low';
      if (marginPct < 20) optimizationPotential = 'high';
      else if (marginPct < 40) optimizationPotential = 'medium';

      breakdowns.push({
        menu_item_id: product.id,
        product_name: product.name_az || product.name,
        selling_price: sellingPrice,
        cost_price: Math.round(costPrice * 100) / 100,
        margin_pct: Math.round(marginPct * 100) / 100,
        profit_per_unit: Math.round((sellingPrice - costPrice) * 100) / 100,
        monthly_units_sold: monthlyUnits,
        monthly_profit: Math.round(monthlyProfit * 100) / 100,
        cost_drivers: costDrivers.slice(0, 5),
        optimization_potential: optimizationPotential,
      });
    }

    breakdowns.sort((a, b) => a.margin_pct - b.margin_pct);

    return NextResponse.json({
      breakdowns,
      metadata: {
        total: products.length,
        with_recipes: breakdowns.length,
        avg_margin: breakdowns.length > 0
          ? Math.round(breakdowns.reduce((s, b) => s + b.margin_pct, 0) / breakdowns.length * 100) / 100
          : 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
