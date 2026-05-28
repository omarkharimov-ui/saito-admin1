import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const iso = todayStart.toISOString();

    // Parallel fetch: orders, order items, active tables, ingredients, recipes, waste logs
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
      supabase.from('ingredients').select('id, average_cost_per_unit'),
      supabase.from('recipes').select('menu_item_id, ingredient_id, quantity_required'),
      supabase.from('inventory_logs')
        .select('quantity, cost_per_unit, ingredient_id')
        .in('type', ['waste', 'adjustment'])
        .gte('created_at', iso),
      supabase.from('inventory_status')
        .select('id, name, unit, current_stock, critical_limit, status')
        .in('status', ['critical', 'out_of_stock']),
    ]);

    // ── Revenue ──────────────────────────────────────────────────────────
    const dailyRevenue = paidToday?.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) ?? 0;
    const activeTables = new Set(activeOrders?.map((o: any) => o.table_number).filter(Boolean)).size;

    // ── Top product ───────────────────────────────────────────────────────
    const productCounts: Record<string, number> = {};
    (todayItems ?? []).forEach((item: any) => {
      const name = item.product_name || 'Naməlum';
      productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
    });
    const topEntry = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0];
    const topProduct = topEntry ? topEntry[0] : '—';

    // ── Finance metrics ───────────────────────────────────────────────────
    const ingCostMap = new Map<string, number>();
    (ingredients ?? []).forEach((ing: any) => ingCostMap.set(ing.id, Number(ing.average_cost_per_unit) || 0));

    const recipeMap = new Map<string, { ingredient_id: string; quantity_required: number }[]>();
    (recipes ?? []).forEach((r: any) => {
      const list = recipeMap.get(r.menu_item_id) || [];
      list.push({ ingredient_id: r.ingredient_id, quantity_required: Number(r.quantity_required) || 0 });
      recipeMap.set(r.menu_item_id, list);
    });

    let dailyFoodCost = 0;
    (todayItems ?? []).forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      const qty = Number(item.quantity) || 0;
      const unitFoodCost = (recipeMap.get(pid) || []).reduce(
        (s, ri) => s + ri.quantity_required * (ingCostMap.get(ri.ingredient_id) || 0), 0
      );
      dailyFoodCost += unitFoodCost * qty;
    });

    const dailyWasteCost = (wasteLogs ?? []).reduce((s: number, log: any) => {
      const costPer = Number(log.cost_per_unit) || (ingCostMap.get(log.ingredient_id) || 0);
      return s + Number(log.quantity) * costPer;
    }, 0);

    const dailyNetProfit = dailyRevenue - dailyFoodCost - dailyWasteCost;
    const foodCostPct = dailyRevenue > 0 ? (dailyFoodCost / dailyRevenue) * 100 : 0;

    // ── Low stock alerts ──────────────────────────────────────────────────
    const stockAlerts = (lowStockItems ?? []).map((i: any) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      current_stock: i.current_stock,
      critical_limit: i.critical_limit,
      status: i.status,
    }));

    return NextResponse.json({
      dailyRevenue,
      todayOrders: todayOrders ?? 0,
      activeTables,
      topProduct,
      dailyFoodCost: Math.round(dailyFoodCost * 100) / 100,
      dailyWasteCost: Math.round(dailyWasteCost * 100) / 100,
      dailyNetProfit: Math.round(dailyNetProfit * 100) / 100,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      stockAlerts,
      criticalStockCount: stockAlerts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { dailyRevenue: 0, todayOrders: 0, activeTables: 0, topProduct: '—',
        dailyFoodCost: 0, dailyWasteCost: 0, dailyNetProfit: 0, foodCostPct: 0,
        stockAlerts: [], criticalStockCount: 0 },
      { status: 500 }
    );
  }
}
