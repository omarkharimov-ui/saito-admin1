import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { AIInsight } from '@/types/inventory';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const insights: AIInsight[] = [];

    const { data: suggestions } = await supabase
      .from('ingredients')
      .select('id, name, unit, current_stock, critical_limit, average_cost_per_unit')
      .order('name');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, type, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const consumptionMap: Record<string, number> = {};
    for (const log of logs || []) {
      if (log.type === 'order_consumption' || log.type === 'waste') {
        consumptionMap[log.ingredient_id] = (consumptionMap[log.ingredient_id] || 0) + Math.abs(log.quantity);
      }
    }

    for (const ing of (suggestions || []) as any[]) {
      const totalConsumed = consumptionMap[ing.id] || 0;
      const dailyRate = totalConsumed / 30;
      const daysLeft = dailyRate > 0 ? ing.current_stock / dailyRate : 999;

      if (daysLeft < 3 && ing.current_stock > 0) {
        const reorderQty = Math.ceil((dailyRate * 7) - ing.current_stock);
        if (reorderQty > 0) {
          insights.push({
            type: 'reorder',
            title: `${ing.name} təcili sifariş edilməlidir`,
            description: `Cari stok: ${ing.current_stock} ${ing.unit}. Günlük sərfiyyat: ${dailyRate.toFixed(1)} ${ing.unit}. Təxminən ${daysLeft.toFixed(1)} gün qalıb. Tövsiyə: ${reorderQty} ${ing.unit} sifariş edin.`,
            priority: daysLeft < 1 ? 'high' : 'medium',
            action_url: '/purchase-orders',
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    const { data: products } = await supabase
      .from('products')
      .select('id, name_az, price')
      .eq('has_active_recipe', true);

    const { data: recipes } = await supabase
      .from('recipes')
      .select('*, ingredient:ingredient_id(id, name, average_cost_per_unit, purchase_price)')
      .eq('is_ai_suggested', false);

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .gte('created_at', oneMonthAgo.toISOString());

    const salesByProduct: Record<string, number> = {};
    for (const o of orderItems || []) {
      salesByProduct[o.product_id] = (salesByProduct[o.product_id] || 0) + (o.quantity || 1);
    }

    for (const product of (products || []) as any[]) {
      const productRecipes = (recipes || []).filter((r: any) => r.menu_item_id === product.id);
      if (!productRecipes.length) continue;

      let costPrice = 0;
      for (const r of productRecipes) {
        const ing = (r as any).ingredient as any;
        if (!ing) continue;
        costPrice += r.quantity_required * (ing.average_cost_per_unit || ing.purchase_price || 0);
      }

      if (product.price > 0) {
        const margin = ((product.price - costPrice) / product.price) * 100;
        if (margin < 15 && salesByProduct[product.id] > 10) {
          insights.push({
            type: 'margin',
            title: `${product.name_az || product.id}: marja kritik səviyyədədir`,
            description: `Satış qiyməti: ${product.price} AZN, maya dəyəri: ${costPrice.toFixed(2)} AZN, marja: ${margin.toFixed(1)}%. Son ayda ${salesByProduct[product.id] || 0} ədəd satılıb. Resept optimizasiyası tövsiyə olunur.`,
            priority: 'high',
            action_url: '/recipe-intelligence',
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    const { data: wasteLogs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity')
      .eq('type', 'waste')
      .gte('created_at', oneMonthAgo.toISOString());

    const wasteByIngredient: Record<string, number> = {};
    for (const w of wasteLogs || []) {
      wasteByIngredient[w.ingredient_id] = (wasteByIngredient[w.ingredient_id] || 0) + Math.abs(w.quantity);
    }

    for (const [ingId, wasteQty] of Object.entries(wasteByIngredient)) {
      if (wasteQty > 0) {
        const ing = (suggestions || []).find((i: any) => i.id === ingId);
        if (ing) {
          const consumed = consumptionMap[ingId] || 0;
          const wastePct = consumed > 0 ? (wasteQty / consumed) * 100 : 0;
          if (wastePct > 10) {
            insights.push({
              type: 'waste',
              title: `${ing.name}: tullantı normaları keçib`,
              description: `Son 30 gündə ${wasteQty.toFixed(1)} ${ing.unit} tullantı (ümumi sərfiyyatın ${wastePct.toFixed(1)}%). Tövsiyə olunan norma: <10%.`,
              priority: wastePct > 20 ? 'high' : 'medium',
              action_url: '/stock',
              created_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    insights.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });

    return NextResponse.json({ insights, total: insights.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
