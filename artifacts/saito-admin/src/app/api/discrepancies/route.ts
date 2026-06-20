import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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

    const { data: alerts } = await supabase
      .from('discrepancy_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json(alerts || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = svc();
    const generated: any[] = [];

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const { data: invoices } = await supabase
      .from('invoices')
      .select('*, purchase_orders!left(total_amount)')
      .gte('created_at', oneMonthAgo.toISOString());

    for (const inv of (invoices || []) as any[]) {
      if (inv.purchase_orders && inv.total_amount !== inv.purchase_orders.total_amount) {
        const variance = inv.purchase_orders.total_amount > 0
          ? ((inv.total_amount - inv.purchase_orders.total_amount) / inv.purchase_orders.total_amount) * 100
          : 0;
        if (Math.abs(variance) > 5) {
          const { data: existing } = await supabase
            .from('discrepancy_alerts')
            .select('id')
            .eq('type', 'invoice_amount')
            .eq('source_id', inv.id)
            .eq('status', 'open')
            .maybeSingle();
          if (!existing) {
            const { data } = await supabase.from('discrepancy_alerts').insert({
              type: 'invoice_amount',
              severity: Math.abs(variance) > 15 ? 'critical' : Math.abs(variance) > 10 ? 'high' : 'medium',
              title: `Invoice ${inv.invoice_number} differs from PO`,
              description: `Invoice total (${inv.total_amount} AZN) vs PO total (${inv.purchase_orders.total_amount} AZN) — ${variance.toFixed(1)}% variance`,
              source_id: inv.id,
              source_table: 'invoices',
              value: inv.total_amount,
              expected_value: inv.purchase_orders.total_amount,
              variance_pct: Math.round(variance * 100) / 100,
            }).select().single();
            if (data) generated.push(data);
          }
        }
      }
    }

    const { data: reviews } = await supabase
      .from('procurement_reviews')
      .select('*')
      .eq('status', 'pending')
      .gte('created_at', twoDaysAgo.toISOString());

    if ((reviews || []).length > 5) {
      const { data: existing } = await supabase
        .from('discrepancy_alerts')
        .select('id')
        .eq('type', 'received_qty')
        .eq('status', 'open')
        .maybeSingle();
      if (!existing) {
        const reviewLen = reviews?.length || 0;
        const { data } = await supabase.from('discrepancy_alerts').insert({
          type: 'received_qty',
          severity: 'medium',
          title: `${reviewLen} items pending review`,
          description: `${reviewLen} invoice line items could not be auto-matched to ingredients and need manual review`,
          source_table: 'procurement_reviews',
          value: reviewLen,
          expected_value: 0,
          variance_pct: 100,
        }).select().single();
        if (data) generated.push(data);
      }
    }

    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, name, current_stock, theoretical_stock');

    for (const ing of (ingredients || []) as any[]) {
      if (ing.theoretical_stock > 0 && ing.current_stock > 0) {
        const variance = ((ing.current_stock - ing.theoretical_stock) / ing.theoretical_stock) * 100;
        if (Math.abs(variance) > 25) {
          const { data: existing } = await supabase
            .from('discrepancy_alerts')
            .select('id')
            .eq('type', 'stock_vs_sales')
            .eq('source_id', ing.id)
            .eq('status', 'open')
            .maybeSingle();
          if (!existing) {
            const { data } = await supabase.from('discrepancy_alerts').insert({
              type: 'stock_vs_sales',
              severity: Math.abs(variance) > 50 ? 'high' : 'medium',
              title: `${ing.name} stock inconsistent with sales`,
              description: `Current stock (${ing.current_stock}) vs theoretical (${ing.theoretical_stock}) — ${variance.toFixed(1)}% variance`,
              source_id: ing.id,
              source_table: 'ingredients',
              value: ing.current_stock,
              expected_value: ing.theoretical_stock,
              variance_pct: Math.round(variance * 100) / 100,
            }).select().single();
            if (data) generated.push(data);
          }
        }
      }
    }

    const { data: wasteLogs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, created_at')
      .eq('type', 'waste')
      .gte('created_at', oneMonthAgo.toISOString());

    const wasteByIngredient: Record<string, number> = {};
    for (const w of wasteLogs || []) {
      wasteByIngredient[w.ingredient_id] = (wasteByIngredient[w.ingredient_id] || 0) + Math.abs(w.quantity);
    }

    const { data: consumptionLogs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity')
      .eq('type', 'order_consumption')
      .gte('created_at', oneMonthAgo.toISOString());

    const consumptionByIngredient: Record<string, number> = {};
    for (const c of consumptionLogs || []) {
      consumptionByIngredient[c.ingredient_id] = (consumptionByIngredient[c.ingredient_id] || 0) + Math.abs(c.quantity);
    }

    const { data: wasteStandards } = await supabase
      .from('waste_standards')
      .select('keyword, waste_percentage');

    for (const [ingId, wasteQty] of Object.entries(wasteByIngredient)) {
      const consumed = consumptionByIngredient[ingId] || 0;
      if (consumed <= 0) continue;
      const wastePct = (wasteQty / consumed) * 100;
      if (wastePct > 10) {
        const ing = (ingredients || []).find((i: any) => i.id === ingId);
        if (!ing) continue;
        const existingCheck = await supabase
          .from('discrepancy_alerts')
          .select('id')
          .eq('type', 'waste_vs_norm')
          .eq('source_id', ingId)
          .eq('status', 'open')
          .maybeSingle();
        if (!existingCheck.data) {
          const { data: alert } = await supabase.from('discrepancy_alerts').insert({
            type: 'waste_vs_norm',
            severity: wastePct > 20 ? 'high' : 'medium',
            title: `${ing.name}: tullantı norması keçilib`,
            description: `Son 30 gündə tullantı: ${wasteQty.toFixed(1)} (ümumi sərfiyyatın ${wastePct.toFixed(1)}%). Tövsiyə olunan norma: <10%`,
            source_id: ingId,
            source_table: 'ingredients',
            value: Math.round(wastePct * 100) / 100,
            expected_value: 10,
            variance_pct: Math.round((wastePct - 10) * 100) / 100,
          }).select().single();
          if (alert) generated.push(alert);
        }
      }
    }

    const { data: allSuppliers } = await supabase
      .from('suppliers')
      .select('id, name');

    for (const supplier of (allSuppliers || []) as any[]) {
      const { data: sItems } = await supabase
        .from('purchase_order_items')
        .select('product_name, unit_cost, created_at, purchase_orders!inner(supplier_id)')
        .eq('purchase_orders.supplier_id', supplier.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!sItems?.length) continue;

      const productPrices: Record<string, number[]> = {};
      for (const item of sItems as any[]) {
        if (!productPrices[item.product_name]) productPrices[item.product_name] = [];
        productPrices[item.product_name].push(item.unit_cost);
      }

      for (const [productName, prices] of Object.entries(productPrices)) {
        if (prices.length < 3) continue;
        const sorted = [...prices].sort((a, b) => a - b);
        const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
        const mid = Math.floor(sorted.length / 2);
        const recentPrices = sorted.slice(mid);
        const recentAvg = recentPrices.length > 0 ? recentPrices.reduce((s, p) => s + p, 0) / recentPrices.length : avg;
        const variance = avg > 0 ? ((recentAvg - avg) / avg) * 100 : 0;

        if (Math.abs(variance) > 10 && prices.length >= 3) {
          const existingCheck = await supabase
            .from('discrepancy_alerts')
            .select('id')
            .eq('type', 'supplier_price')
            .eq('source_id', `${supplier.id}-${productName}`)
            .eq('status', 'open')
            .maybeSingle();
          if (!existingCheck.data) {
            const { data: alert } = await supabase.from('discrepancy_alerts').insert({
              type: 'supplier_price',
              severity: Math.abs(variance) > 20 ? 'high' : 'medium',
              title: `${supplier.name}: ${productName} qiyməti dəyişib`,
              description: `${prices.length} alış üzrə ortalama qiymət: ${avg.toFixed(4)} AZN. Son dövr ortalaması: ${recentAvg.toFixed(4)} AZN (${variance > 0 ? '+' : ''}${variance.toFixed(1)}%)`,
              source_id: `${supplier.id}-${productName}`,
              source_table: 'suppliers',
              value: Math.round(recentAvg * 10000) / 10000,
              expected_value: Math.round(avg * 10000) / 10000,
              variance_pct: Math.round(variance * 100) / 100,
            }).select().single();
            if (alert) generated.push(alert);
          }
        }
      }
    }

    const { data: menuItems } = await supabase
      .from('products')
      .select('id, name, price, discount_price');

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, quantity, unit_price, total_price, created_at')
      .gte('created_at', oneMonthAgo.toISOString());

    const unitsSold: Record<string, number> = {};
    const productRevenue: Record<string, { total: number; count: number }> = {};
    for (const oi of (orderItems || []) as any[]) {
      if (oi.product_id) {
        unitsSold[oi.product_id] = (unitsSold[oi.product_id] || 0) + (oi.quantity || 0);
        if (!productRevenue[oi.product_id]) productRevenue[oi.product_id] = { total: 0, count: 0 };
        productRevenue[oi.product_id].total += oi.total_price || 0;
        productRevenue[oi.product_id].count += 1;
      }
    }

    for (const product of (menuItems || []) as any[]) {
      if (!product.discount_price) continue;
      const avgPrice = productRevenue[product.id]
        ? productRevenue[product.id].total / productRevenue[product.id].count
        : product.price;
      if (avgPrice <= 0) continue;
      const marginDrop = product.discount_price
        ? ((product.price - product.discount_price) / product.price) * 100
        : 0;
      if (marginDrop > 10) {
        const existing = await supabase
          .from('discrepancy_alerts')
          .select('id')
          .eq('type', 'margin_drop')
          .eq('source_id', product.id)
          .eq('status', 'open')
          .maybeSingle();
        if (!existing.data) {
          const { data: alert } = await supabase.from('discrepancy_alerts').insert({
            type: 'margin_drop',
            severity: marginDrop > 20 ? 'high' : 'medium',
            title: `${product.name}: marja düşüb`,
            description: `Satış qiyməti ${product.price} AZN-dan ${product.discount_price} AZN-a endirilib (${marginDrop.toFixed(1)}% eniş)`,
            source_id: product.id,
            source_table: 'products',
            value: Math.round(product.discount_price * 100) / 100,
            expected_value: product.price,
            variance_pct: Math.round(marginDrop * 100) / 100,
          }).select().single();
          if (alert) generated.push(alert);
        }
      }
    }

    const { data: recipeRows } = await supabase
      .from('recipes')
      .select('menu_item_id, ingredient_id, quantity_required, ingredients!inner(name)');

    const theoreticalUsage: Record<string, number> = {};
    const recipeItemNames: Record<string, { itemId: string; name: string }> = {};
    for (const rr of (recipeRows || []) as any[]) {
      const key = `${rr.menu_item_id}-${rr.ingredient_id}`;
      const sold = unitsSold[rr.menu_item_id] || 0;
      theoreticalUsage[rr.ingredient_id] = (theoreticalUsage[rr.ingredient_id] || 0) + (rr.quantity_required || 0) * sold;
      if (!recipeItemNames[rr.ingredient_id]) {
        recipeItemNames[rr.ingredient_id] = { itemId: rr.menu_item_id, name: (rr.ingredients as any)?.name || rr.ingredient_id };
      }
    }

    for (const [ingId, theoretical] of Object.entries(theoreticalUsage)) {
      const actual = consumptionByIngredient[ingId] || 0;
      if (theoretical <= 0) continue;
      const variance = actual > 0 ? ((actual - theoretical) / theoretical) * 100 : -100;
      if (Math.abs(variance) > 25) {
        const existing = await supabase
          .from('discrepancy_alerts')
          .select('id')
          .eq('type', 'recipe_vs_actual')
          .eq('source_id', ingId)
          .eq('status', 'open')
          .maybeSingle();
        if (!existing.data) {
          const ingName = recipeItemNames[ingId]?.name || ingId;
          const { data: alert } = await supabase.from('discrepancy_alerts').insert({
            type: 'recipe_vs_actual',
            severity: Math.abs(variance) > 50 ? 'high' : 'medium',
            title: `${ingName}: resept vs faktiki uyğunsuzluq`,
            description: `Nəzəri sərfiyyat: ${theoretical.toFixed(1)}. Faktiki sərfiyyat: ${actual.toFixed(1)} (${variance > 0 ? '+' : ''}${variance.toFixed(1)}%)`,
            source_id: ingId,
            source_table: 'ingredients',
            value: Math.round(actual * 100) / 100,
            expected_value: Math.round(theoretical * 100) / 100,
            variance_pct: Math.round(variance * 100) / 100,
          }).select().single();
          if (alert) generated.push(alert);
        }
      }
    }

    return NextResponse.json({ generated: generated.length, alerts: generated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = svc();
    const { id, status } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const update: any = { status: status || 'acknowledged' };
    if (status === 'resolved') update.resolved_at = new Date().toISOString();

    await supabase.from('discrepancy_alerts').update(update).eq('id', id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
