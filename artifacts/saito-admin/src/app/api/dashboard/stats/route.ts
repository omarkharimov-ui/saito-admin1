import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';
import { calculateCalibrationSuggestions, calculateMarginInsight } from '@/lib/stockAnalytics';

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const iso = todayStart.toISOString();

    const [
      { data: paidToday },
      { count: todayOrders },
      { data: activeOrders },
      { data: todayItems },
      { data: ingredients },
      { data: recipes },
      { data: wasteLogs },
      { data: lowStockItems },
    ] = await Promise.all([
      supabase.from('orders').select('total_amount').eq('status', 'paid').gte('created_at', iso),
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', iso),
      supabase.from('orders').select('table_number').in('status', ['new', 'confirmed']),
      supabase.from('order_items')
        .select('product_id, product_name, quantity, unit_price, total_price, order:orders!inner(created_at, status)')
        .eq('order.status', 'paid')
        .gte('order.created_at', iso),
      supabase.from('ingredients').select('id, name, unit, current_stock, theoretical_stock, average_cost_per_unit, cold_waste_percentage'),
      supabase.from('recipes').select('menu_item_id, ingredient_id, quantity_required'),
      supabase.from('inventory_logs')
        .select('id, quantity, cost_per_unit, ingredient_id')
        .in('type', ['waste', 'adjustment'])
        .gte('created_at', iso),
      supabase.from('inventory_status')
        .select('id, name, unit, current_stock, critical_limit, status')
        .in('status', ['critical', 'out_of_stock']),
    ]);

    const dailyRevenue = paidToday?.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) ?? 0;
    const activeTables = new Set(activeOrders?.map((o: any) => o.table_number).filter(Boolean)).size;

    const ingCostMap = new Map<string, { cost: number; waste: number }>();
    (ingredients ?? []).forEach((ing: any) => 
      ingCostMap.set(ing.id, { 
        cost: Number(ing.average_cost_per_unit) || 0, 
        waste: Number(ing.cold_waste_percentage) || 0 
      })
    );

    const recipeMap = new Map<string, { ingredient_id: string; quantity_required: number }[]>();
    (recipes ?? []).forEach((r: any) => {
      const list = recipeMap.get(r.menu_item_id) || [];
      list.push({ ingredient_id: r.ingredient_id, quantity_required: Number(r.quantity_required) || 0 });
      recipeMap.set(r.menu_item_id, list);
    });

    let dailyFoodCost = 0;
    (todayItems ?? []).forEach((item: any) => {
      const pid = item.product_id;
      const qty = Number(item.quantity) || 0;
      const itemRevenue = Number(item.total_price) || 0;
      
      const itemRecipe = recipeMap.get(pid);
      
      if (itemRecipe && itemRecipe.length > 0) {
        const unitFoodCost = itemRecipe.reduce((s, ri) => {
          const ing = ingCostMap.get(ri.ingredient_id);
          if (!ing) return s;
          const wasteMultiplier = 1 + (ing.waste / 100);
          return s + (ri.quantity_required * ing.cost * wasteMultiplier);
        }, 0);
        dailyFoodCost += unitFoodCost * qty;
      } else if (ingredients?.length) {
        // Data-driven: use average ingredient cost across all ingredients
        const avgIngCost = Array.from(ingCostMap.values()).reduce((a, b) => a + b.cost, 0) / ingCostMap.size;
        const unitPrice = itemRevenue / (qty || 1);
        dailyFoodCost += Math.min(avgIngCost, unitPrice * 0.5) * qty;
      }
    });

    const dailyWasteCost = (wasteLogs ?? []).reduce((s: number, log: any) => {
      const ing = ingCostMap.get(log.ingredient_id);
      const costPer = Number(log.cost_per_unit) || (ing?.cost || 0);
      return s + (Number(log.quantity) * costPer);
    }, 0);

    const dailyNetProfit = dailyRevenue - dailyFoodCost - dailyWasteCost;
    const foodCostPct = dailyRevenue > 0 ? (dailyFoodCost / dailyRevenue) * 100 : 0;

    const productCounts: Record<string, number> = {};
    (todayItems ?? []).forEach((item: any) => {
      const name = item.product_name || 'Naməlum';
      productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
    });
    const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    return NextResponse.json({
      dailyRevenue: Math.round(dailyRevenue * 100) / 100,
      todayOrders: todayOrders ?? 0,
      activeTables,
      topProduct,
      dailyFoodCost: Math.round(dailyFoodCost * 100) / 100,
      dailyWasteCost: Math.round(dailyWasteCost * 100) / 100,
      dailyNetProfit: Math.round(dailyNetProfit * 100) / 100,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      stockAlerts: (lowStockItems ?? []).length,
      marginInsight: calculateMarginInsight({
        revenue: dailyRevenue,
        foodCost: dailyFoodCost,
        wasteCost: dailyWasteCost,
      }),
    });
  } catch (error) {
    console.error('[stats-api] error:', error);
    return NextResponse.json({ dailyRevenue: 0, todayOrders: 0, dailyNetProfit: 0 }, { status: 500 });
  }
}
