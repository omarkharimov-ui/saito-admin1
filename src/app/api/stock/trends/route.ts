import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { ConsumptionTrend } from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = svc();
    const { searchParams } = new URL(request.url);
    const ingredientId = searchParams.get('ingredient_id');
    const days = parseInt(searchParams.get('days') || '30');

    let ingredientsQuery = supabase.from('ingredients').select('id, name, unit');
    if (ingredientId) ingredientsQuery = ingredientsQuery.eq('id', ingredientId);
    const { data: ingredients } = await ingredientsQuery;

    if (!ingredients?.length) {
      return NextResponse.json([]);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, created_at')
      .gte('created_at', startDate.toISOString())
      .in('type', ['order_consumption', 'waste']);

    const trends: ConsumptionTrend[] = ingredients.map(ing => {
      const ingLogs = (logs || []).filter(l => l.ingredient_id === ing.id);
      const dailyMap: Record<string, number> = {};
      for (const log of ingLogs) {
        const date = log.created_at.split('T')[0];
        dailyMap[date] = (dailyMap[date] || 0) + Math.abs(log.quantity);
      }

      const daily = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, consumption]) => ({ date, consumption: Math.round(consumption * 100) / 100 }));

      const values = daily.map(d => d.consumption);
      const total = values.reduce((s, v) => s + v, 0);
      const avg = values.length > 0 ? total / values.length : 0;

      const mid = Math.floor(values.length / 2);
      const firstHalf = values.slice(0, mid);
      const secondHalf = values.slice(mid);
      const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length : 0;
      const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length : 0;
      const trendPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

      return {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.unit,
        daily,
        weekly_avg: Math.round(avg * 7 * 100) / 100,
        monthly_avg: Math.round(avg * 30 * 100) / 100,
        trend_pct: Math.round(trendPct * 100) / 100,
      };
    });

    trends.sort((a, b) => Math.abs(b.trend_pct) - Math.abs(a.trend_pct));

    return NextResponse.json(trends);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
