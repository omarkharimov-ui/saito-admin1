import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();

    const { data: products } = await supabase
      .from('products')
      .select('id, name_az, price')
      .eq('has_active_recipe', true);

    if (!products?.length) {
      return NextResponse.json({ analyses: [], metadata: { total: 0 } });
    }

    const productIds = products.map(p => p.id);

    const { data: recipes } = await supabase
      .from('recipes')
      .select('*, ingredient:ingredient_id(id, name, unit, average_cost_per_unit, purchase_price, cold_waste_percentage)')
      .in('menu_item_id', productIds)
      .eq('is_ai_suggested', false);

    if (!recipes?.length) {
      return NextResponse.json({ analyses: [], metadata: { total: products.length, with_recipes: 0 } });
    }

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, quantity, created_at')
      .in('product_id', productIds)
      .gte('created_at', oneMonthAgo.toISOString());

    const salesByProduct: Record<string, number> = {};
    for (const o of orderItems || []) {
      salesByProduct[o.product_id] = (salesByProduct[o.product_id] || 0) + (o.quantity || 1);
    }

    const { data: inventoryLogs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, type, created_at')
      .gte('created_at', oneMonthAgo.toISOString());

    const consumptionByIngredient: Record<string, number> = {};
    const wasteByIngredient: Record<string, number> = {};
    for (const log of inventoryLogs || []) {
      const qty = Math.abs(log.quantity);
      if (log.type === 'order_consumption') {
        consumptionByIngredient[log.ingredient_id] = (consumptionByIngredient[log.ingredient_id] || 0) + qty;
      } else if (log.type === 'waste') {
        wasteByIngredient[log.ingredient_id] = (wasteByIngredient[log.ingredient_id] || 0) + qty;
      }
    }

    const analyses: any[] = [];

    for (const product of products as any[]) {
      const productRecipes = (recipes as any[]).filter(r => r.menu_item_id === product.id);
      if (!productRecipes.length) continue;

      const totalServings = salesByProduct[product.id] || 0;
      const theoreticalConsumption: Record<string, number> = {};

      let theoreticalCostPerServing = 0;
      let theoreticalCostTotal = 0;

      for (const r of productRecipes) {
        const ing = r.ingredient as any;
        if (!ing) continue;
        const unitCost = (ing.average_cost_per_unit || ing.purchase_price || 0);
        const qty = (r.quantity_required || 0) * totalServings;
        theoreticalConsumption[ing.name] = (theoreticalConsumption[ing.name] || 0) + qty;
        theoreticalCostPerServing += (r.quantity_required || 0) * unitCost;
        theoreticalCostTotal += qty * unitCost;
      }

      const wasteAnalysis: any[] = [];
      let actualCostTotal = 0;

      for (const r of productRecipes) {
        const ing = r.ingredient as any;
        if (!ing) continue;
        const unitCost = (ing.average_cost_per_unit || ing.purchase_price || 0);
        const theoreticalQty = (r.quantity_required || 0) * totalServings;
        const actualConsumed = consumptionByIngredient[ing.id] || 0;
        const wasted = wasteByIngredient[ing.id] || 0;
        const actualQty = actualConsumed + wasted;
        const wasteQty = wasted;
        const wastePct = actualQty > 0 ? (wasteQty / actualQty) * 100 : 0;

        actualCostTotal += (actualConsumed + wasted) * unitCost;

        if (theoreticalQty > 0 || actualQty > 0) {
          wasteAnalysis.push({
            ingredient_name: ing.name,
            theoretical_qty: Math.round(theoreticalQty * 100) / 100,
            actual_qty: Math.round(actualQty * 100) / 100,
            waste_qty: Math.round(wasteQty * 100) / 100,
            waste_pct: Math.round(wastePct * 100) / 100,
          });
        }
      }

      const sellingPrice = product.price || 0;
      const theoreticalCostPerServingFinal = totalServings > 0
        ? theoreticalCostTotal / totalServings
        : theoreticalCostPerServing;
      const actualCostPerServing = totalServings > 0
        ? actualCostTotal / totalServings
        : theoreticalCostPerServingFinal;
      const costVariancePct = theoreticalCostPerServingFinal > 0
        ? ((actualCostPerServing - theoreticalCostPerServingFinal) / theoreticalCostPerServingFinal) * 100
        : 0;
      const theoreticalMargin = sellingPrice > 0
        ? ((sellingPrice - theoreticalCostPerServingFinal) / sellingPrice) * 100
        : 0;
      const actualMargin = sellingPrice > 0
        ? ((sellingPrice - actualCostPerServing) / sellingPrice) * 100
        : 0;

      analyses.push({
        menu_item_id: product.id,
        product_name: product.name_az || product.name || product.id,
        total_servings: totalServings,
        theoretical_cost_per_serving: Math.round(theoreticalCostPerServingFinal * 100) / 100,
        actual_cost_per_serving: Math.round(actualCostPerServing * 100) / 100,
        cost_variance_pct: Math.round(costVariancePct * 100) / 100,
        theoretical_consumption: theoreticalConsumption,
        actual_consumption: consumptionByIngredient,
        waste_analysis: wasteAnalysis,
        margin_analysis: {
          selling_price: sellingPrice,
          theoretical_cost: Math.round(theoreticalCostTotal * 100) / 100,
          actual_cost: Math.round(actualCostTotal * 100) / 100,
          theoretical_margin_pct: Math.round(theoreticalMargin * 100) / 100,
          actual_margin_pct: Math.round(actualMargin * 100) / 100,
        },
      });
    }

    return NextResponse.json({ analyses, metadata: { total: products.length, with_data: analyses.length } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
