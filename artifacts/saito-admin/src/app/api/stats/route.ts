import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  };
}

export async function GET(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || 'today';

    const now = new Date();
    let isoStartDate: string;
    let isoEndDate: string = now.toISOString();

    switch (timeFilter) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        isoStartDate = today.toISOString();
        break;
      case 'week':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        isoStartDate = weekAgo.toISOString();
        break;
      case 'month':
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        isoStartDate = monthAgo.toISOString();
        break;
      case '3months':
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        isoStartDate = threeMonthsAgo.toISOString();
        break;
      case 'year':
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        isoStartDate = yearAgo.toISOString();
        break;
      default:
        const defaultStart = new Date();
        defaultStart.setHours(0, 0, 0, 0);
        isoStartDate = defaultStart.toISOString();
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_supabaseUrl || '';
    const H = svcHeaders();

    const [
      ordersRes,
      orderItemsRes,
      productsRes,
      categoriesRes,
      cancelledOrdersRes,
      recipesRes,
      ingredientsRes,
      wasteLogsRes,
      activeOrdersRes,
      clockEventsRes,
    ] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/orders?select=id,total_amount,created_at,status,table_number&status=eq.paid&created_at=gte.${isoStartDate}&created_at=lte.${isoEndDate}&order=created_at.asc`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/order_items?select=*,order:orders!inner(id,status,created_at)&order.status=eq.paid&order.created_at=gte.${isoStartDate}&order.created_at=lte.${isoEndDate}`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/products?select=id,name,price,image_url,views_count,is_ready_product,direct_ingredient_id,category:categories(id,name)`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/categories?select=id,name,translations&order=name`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/cancelled_orders?select=*&created_at=gte.${isoStartDate}`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/recipes?select=menu_item_id,ingredient_id,quantity_required`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/ingredients?select=id,average_cost_per_unit`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/inventory_logs?select=quantity,cost_per_unit,ingredient_id&or=(type.eq.waste,type.eq.adjustment)&created_at=gte.${isoStartDate}&created_at=lte.${isoEndDate}`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/orders?select=table_number&or=(status.eq.new,status.eq.confirmed)`, { headers: H }),
      fetch(`${supabaseUrl}/rest/v1/clock_events?select=*&clock_in=gte.${isoStartDate}`, { headers: H }),
    ]);

    const [orders, orderItems, products, categories, cancelledOrders, recipes, ingredients, wasteLogs, activeOrders, clockEvents] = await Promise.all([
      ordersRes.json(),
      orderItemsRes.json(),
      productsRes.json(),
      categoriesRes.json(),
      cancelledOrdersRes.json(),
      recipesRes.json(),
      ingredientsRes.json(),
      wasteLogsRes.json(),
      activeOrdersRes.json(),
      clockEventsRes.json(),
    ]);

    // Real Labor Cost Calculation
    let calculatedLaborCost = 0;
    const HOURLY_RATE = 5; // Target hourly rate in AZN
    (Array.isArray(clockEvents) ? clockEvents : []).forEach((ev: any) => {
      if (ev.clock_in && ev.clock_out) {
        const durationHours = (new Date(ev.clock_out).getTime() - new Date(ev.clock_in).getTime()) / (1000 * 60 * 60);
        calculatedLaborCost += Math.max(0, durationHours) * HOURLY_RATE;
      } else if (ev.clock_in) {
        // Still working? Estimate until now
        const durationHours = (new Date().getTime() - new Date(ev.clock_in).getTime()) / (1000 * 60 * 60);
        calculatedLaborCost += Math.max(0, durationHours) * HOURLY_RATE;
      }
    });

    const totalRevenue = orders?.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0) || 0;
    const totalOrders = orders?.length || 0;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const hourMap: Record<number, number> = {};
    orders?.forEach((o: any) => {
      const h = new Date(o.created_at).getHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
    });
    const peakHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] || 0 }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);


    const productMap = new Map();
    orderItems?.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      const existing = productMap.get(pid) || { sold: 0, revenue: 0 };
      existing.sold += Math.max(0, item.quantity || 0);
      existing.revenue += Math.max(0, item.total_price || 0);
      productMap.set(pid, existing);
    });

    const productPerformance = products?.map((p: any) => {
      const stats = productMap.get(p.id) || { sold: 0, revenue: 0 };
      const views = p.views_count || 0;
      const sold = stats.sold;
      const conversion = views > 0 ? Math.round((sold / views) * 100) : 0;
      return {
        id: p.id,
        name: p.name,
        image: p.image_url,
        category: p.category?.name || '',
        sold,
        revenue: stats.revenue,
        views,
        conversion,
      };
    }).sort((a: any, b: any) => b.revenue - a.revenue) || [];

    const ingCostMap = new Map<string, number>();
    (Array.isArray(ingredients) ? ingredients : []).forEach((ing: any) => {
      ingCostMap.set(ing.id, Number(ing.average_cost_per_unit) || 0);
    });

    const recipeMap = new Map<string, { ingredient_id: string; quantity_required: number }[]>();
    (Array.isArray(recipes) ? recipes : []).forEach((r: any) => {
      const list = recipeMap.get(r.menu_item_id) || [];
      list.push({ ingredient_id: r.ingredient_id, quantity_required: Number(r.quantity_required) || 0 });
      recipeMap.set(r.menu_item_id, list);
    });

    const productMeta = new Map<string, any>();
    (Array.isArray(products) ? products : []).forEach((p: any) => {
      productMeta.set(p.id, p);
    });

    let totalFoodCost = 0;
    const profitByProduct = new Map<string, { name: string; sold: number; revenue: number; food_cost: number }>();

    (Array.isArray(orderItems) ? orderItems : []).forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      const qty = Number(item.quantity) || 0;
      const unitRevenue = Number(item.unit_price) || Number(item.total_price) / (qty || 1);
      
      const prod = productMeta.get(pid);
      const recipeIngredients = recipeMap.get(pid) || [];
      
      let unitFoodCost = 0;
      
      if (recipeIngredients.length > 0) {
        unitFoodCost = recipeIngredients.reduce((sum, ri) => {
          return sum + ri.quantity_required * (ingCostMap.get(ri.ingredient_id) || 0);
        }, 0);
      } else if (prod?.is_ready_product && prod?.direct_ingredient_id) {
        unitFoodCost = ingCostMap.get(prod.direct_ingredient_id) || 0;
      } else {
        // Data-driven fallback: use average ingredient cost from same category
        const catId = prod?.category?.id || prod?.category_id;
        const catProducts = Array.isArray(products) ? products.filter((p: any) => (p.category?.id || p.category_id) === catId) : [];
        let categoryAvgCost = 0;
        let categoryAvgPrice = 0;
        for (const cp of catProducts) {
          const cpRecipe = recipeMap.get(cp.id);
          if (cpRecipe && cpRecipe.length > 0) {
            const cost = cpRecipe.reduce((s, ri) => s + ri.quantity_required * (ingCostMap.get(ri.ingredient_id) || 0), 0);
            categoryAvgCost += cost;
          } else if (cp.direct_ingredient_id) {
            categoryAvgCost += ingCostMap.get(cp.direct_ingredient_id) || 0;
          }
          categoryAvgPrice += Number(cp.price) || 0;
        }
        const n = catProducts.length || 1;
        const avgCostForCat = categoryAvgCost / n;
        const avgPriceForCat = categoryAvgPrice / n;
        unitFoodCost = avgCostForCat > 0 ? avgCostForCat : (avgPriceForCat > 0 ? unitRevenue * (avgCostForCat / avgPriceForCat) : ingCostMap.get(prod?.direct_ingredient_id) || 0);
      }

      const lineFoodCost = unitFoodCost * qty;
      totalFoodCost += lineFoodCost;

      const existing = profitByProduct.get(pid) || { name: item.product_name || '?', sold: 0, revenue: 0, food_cost: 0 };
      existing.sold += qty;
      existing.revenue += Number(item.total_price) || unitRevenue * qty;
      existing.food_cost += lineFoodCost;
      profitByProduct.set(pid, existing);
    });

    // Waste cost: quantity * cost_per_unit (fallback to ingredient avg cost)
    const totalWasteCost = (Array.isArray(wasteLogs) ? wasteLogs : []).reduce((sum: number, log: any) => {
      const costPer = Number(log.cost_per_unit) || (ingCostMap.get(log.ingredient_id) || 0);
      return sum + Number(log.quantity) * costPer;
    }, 0);

    const grossProfit = totalRevenue - totalFoodCost;
    const foodCostPct = totalRevenue > 0 ? (totalFoodCost / totalRevenue) * 100 : 0;

    // Fixed costs logic (Labor & Utility) - Priority 7
    const laborCost = calculatedLaborCost > 0 ? calculatedLaborCost : (totalRevenue * 0.18); // Use real data if exists, otherwise estimate
    const utilityCost = totalRevenue * 0.05; // 5% target estimate for utility
    const netProfit = grossProfit - totalWasteCost - laborCost - utilityCost;

    const topProfitableItems = Array.from(profitByProduct.entries())
      .map(([pid, d]) => ({
        id: pid,
        name: d.name,
        sold: d.sold,
        revenue: Math.round(d.revenue * 100) / 100,
        food_cost: Math.round(d.food_cost * 100) / 100,
        net_profit: Math.round((d.revenue - d.food_cost) * 100) / 100,
        markup_pct: d.food_cost > 0 ? Math.round(((d.revenue - d.food_cost) / d.food_cost) * 100) : null,
      }))
      .filter(p => p.revenue > 0)
      .sort((a, b) => b.net_profit - a.net_profit)
      .slice(0, 10);

    const profitDateMap: Record<string, { revenue: number; profit: number }> = {};
    (Array.isArray(orders) ? orders : []).forEach((o: any) => {
      const d = new Date(o.created_at);
      const key = timeFilter === 'today'
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (!profitDateMap[key]) profitDateMap[key] = { revenue: 0, profit: 0 };
      profitDateMap[key].revenue += Number(o.total_amount) || 0;
    });

    (Array.isArray(orderItems) ? orderItems : []).forEach((item: any) => {
      const orderDate = item.order?.created_at;
      if (!orderDate) return;
      const d = new Date(orderDate);
      const key = timeFilter === 'today'
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (!profitDateMap[key]) return;
      const pid = item.product_id;
      if (!pid) return;
      const qty = Number(item.quantity) || 0;
      const recipeIngredients = recipeMap.get(pid) || [];
      const lineFoodCost = recipeIngredients.reduce((sum, ri) => {
        return sum + ri.quantity_required * (ingCostMap.get(ri.ingredient_id) || 0);
      }, 0) * qty;
      profitDateMap[key].profit -= lineFoodCost;
    });

    (Array.isArray(wasteLogs) ? wasteLogs : []).forEach((log: any) => {
      const d = new Date(log.created_at);
      const key = timeFilter === 'today'
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (!profitDateMap[key]) return;
      const costPer = Number(log.cost_per_unit) || (ingCostMap.get(log.ingredient_id) || 0);
      profitDateMap[key].profit -= Number(log.quantity) * costPer;
    });

    // Convert to array: net_profit = revenue + profit (where profit is negative costs)
    const financeChartData = Object.entries(profitDateMap).map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
      net_profit: Math.round((v.revenue + v.profit) * 100) / 100,
    }));

    const cancellationMap: Record<string, { count: number; amount: number }> = {};
    cancelledOrders?.forEach((c: any) => {
      const reason = c.reason || 'unknown';
      if (!cancellationMap[reason]) cancellationMap[reason] = { count: 0, amount: 0 };
      cancellationMap[reason].count++;
      cancellationMap[reason].amount += Number(c.total_amount) || 0;
    });

    const cancellationReasons = Object.entries(cancellationMap).map(([reason, data]) => ({
      reason,
      count: data.count,
      amount: data.amount,
    }));

    const missedRevenue = cancelledOrders?.reduce((s: number, c: any) => s + (Number(c.total_amount) || 0), 0) || 0;

    const dateValueMap: Record<string, number> = {};
    orders?.forEach((o: any) => {
      const d = new Date(o.created_at);
      const key = timeFilter === 'today'
        ? `${String(d.getHours()).padStart(2,'0')}:00`
        : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      dateValueMap[key] = (dateValueMap[key] || 0) + (Number(o.total_amount) || 0);
    });
    const chartData = Object.entries(dateValueMap).map(([date, value]) => ({ date, value }));

    const activeTables = new Set(Array.isArray(activeOrders) ? activeOrders.map((o: any) => o.table_number).filter(Boolean) : []).size;

    const topProduct = productPerformance[0]?.name || '\u2014';
    const topPeakHour = peakHours[0];
    const peakHour = topPeakHour
      ? `${String(topPeakHour.hour).padStart(2,'0')}:00\u2013${String(topPeakHour.hour+1).padStart(2,'00')}:00`
      : '\u2014';

    return NextResponse.json({
      totalRevenue,
      totalOrders,
      activeTables,
      aov,
      missedRevenue,
      peakHours,
      peakHour,
      topProduct,
      productPerformance,
      cancellationReasons,
      chartData,
      totalFoodCost: Math.round(totalFoodCost * 100) / 100,
      totalWasteCost: Math.round(totalWasteCost * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      utilityCost: Math.round(utilityCost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      topProfitableItems,
      financeChartData,
    });

  } catch (error: any) {
    console.error('[Stats API] Error:', error);
    return NextResponse.json(
      { error: 'API xətası: ' + (error.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
