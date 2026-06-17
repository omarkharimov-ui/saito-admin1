import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { StockSuggestion } from '@/types/inventory';

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

    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, name, unit, current_stock, critical_limit, average_cost_per_unit, purchase_price')
      .order('name');

    if (!ingredients?.length) {
      return NextResponse.json({ suggestions: [], metadata: { total: 0, critical: 0 } });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, type, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .in('type', ['order_consumption', 'waste']);

    const { data: olderLogs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, type, created_at')
      .lt('created_at', thirtyDaysAgo.toISOString())
      .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
      .in('type', ['order_consumption', 'waste']);

    const consumptionByIngredient: Record<string, number[]> = {};
    for (const log of logs || []) {
      if (!consumptionByIngredient[log.ingredient_id]) consumptionByIngredient[log.ingredient_id] = [];
      consumptionByIngredient[log.ingredient_id].push(Math.abs(log.quantity));
    }

    const olderConsumption: Record<string, number[]> = {};
    for (const log of olderLogs || []) {
      if (!olderConsumption[log.ingredient_id]) olderConsumption[log.ingredient_id] = [];
      olderConsumption[log.ingredient_id].push(Math.abs(log.quantity));
    }

    const suggestions: StockSuggestion[] = ingredients.map(ing => {
      const recentConsumption = consumptionByIngredient[ing.id] || [];
      const totalRecent = recentConsumption.reduce((s, q) => s + q, 0);
      const dailyRate = totalRecent / 30;
      const daysRemaining = dailyRate > 0 ? ing.current_stock / dailyRate : 999;
      const leadTimeDays = 3;
      const reorderPoint = dailyRate * leadTimeDays * 1.5;
      const suggestedQty = Math.max(0, Math.ceil(reorderPoint - ing.current_stock + dailyRate * 7));

      const olderTotal = (olderConsumption[ing.id] || []).reduce((s, q) => s + q, 0);
      const olderDailyRate = olderTotal / 30;
      const trendPct = olderDailyRate > 0 ? ((dailyRate - olderDailyRate) / olderDailyRate) * 100 : 0;
      const trend: 'rising' | 'stable' | 'falling' =
        trendPct > 10 ? 'rising' : trendPct < -10 ? 'falling' : 'stable';

      let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (ing.current_stock <= 0) urgency = 'critical';
      else if (daysRemaining <= 2) urgency = 'high';
      else if (daysRemaining <= 7) urgency = 'medium';

      return {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.unit,
        current_stock: ing.current_stock,
        critical_limit: ing.critical_limit,
        daily_consumption_rate: Math.round(dailyRate * 100) / 100,
        days_remaining: Math.round(daysRemaining * 10) / 10,
        suggested_reorder_qty: suggestedQty,
        reorder_point: Math.round(reorderPoint * 100) / 100,
        urgency,
        consumption_trend: trend,
        avg_cost_per_unit: ing.average_cost_per_unit || ing.purchase_price || 0,
        estimated_reorder_cost: Math.round(suggestedQty * (ing.average_cost_per_unit || ing.purchase_price || 0) * 100) / 100,
        lead_time_days: leadTimeDays,
      };
    });

    suggestions.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    return NextResponse.json({
      suggestions,
      metadata: {
        total: suggestions.length,
        critical: suggestions.filter(s => s.urgency === 'critical').length,
        high: suggestions.filter(s => s.urgency === 'high').length,
        medium: suggestions.filter(s => s.urgency === 'medium').length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
