import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c (Toast par-based order guide parity, better): the "one look → order
// guide" — every ingredient below its par (critical_limit) with a 7-day
// demand-based suggested quantity, supplier-catalog price pre-filled when
// the ingredient is in a supplier's item list. The UI turns this into a
// draft PO with ONE press.
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const supabase = svc();

    const [ingRes, supRes, itemsRes] = await Promise.all([
      supabase
        .from('ingredients')
        .select('id, name, unit, current_stock, critical_limit, average_cost_per_unit')
        .order('name'),
      supabase.from('suppliers').select('id, name'),
      supabase.from('supplier_items').select('id, supplier_id, name, unit, unit_price, active'),
    ]);
    if (ingRes.error) throw ingRes.error;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: logs, error: logErr } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, type')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .in('type', ['order_consumption', 'waste']);
    if (logErr) throw logErr;

    const rate: Record<string, number> = {};
    for (const l of logs ?? []) rate[l.ingredient_id] = (rate[l.ingredient_id] || 0) + Math.abs(l.quantity);

    const supplierById = new Map((supRes.data ?? []).map((s: any) => [s.id, s.name]));
    // ingredient (lowercase name) → best catalog entry (cheapest active price)
    const catalog: Record<string, { supplier_id: string; unit_price: number | null }> = {};
    for (const it of itemsRes.data ?? []) {
      if (!it.active) continue;
      const key = String(it.name).toLowerCase().trim();
      const cur = catalog[key];
      if (!cur || (it.unit_price != null && (cur.unit_price == null || it.unit_price < cur.unit_price))) {
        catalog[key] = { supplier_id: it.supplier_id, unit_price: it.unit_price ?? null };
      }
    }

    const lines: any[] = [];
    for (const ing of ingRes.data ?? []) {
      const par = Number(ing.critical_limit) || 0;
      const stock = Number(ing.current_stock) || 0;
      // Include rule: below par (when par is set) OR empty/negative (always).
      const needsReorder = (par > 0 && stock < par) || stock <= 0;
      if (!needsReorder) continue;

      const daily = (rate[ing.id] || 0) / 30;
      // Suggested: 7 days of demand on top of current stock; when negative,
      // first repair the phantom debt back to at least par.
      const demand7 = Math.ceil(daily * 7);
      const suggestedQty = stock < 0 ? Math.abs(stock) + Math.max(demand7, par) : Math.max(demand7 - stock, 0);
      if (suggestedQty <= 0) continue;

      const cat = catalog[String(ing.name).toLowerCase().trim()];
      if (supplierId && (!cat || cat.supplier_id !== supplierId)) continue;
      const chosenSupplier = cat?.supplier_id ?? (supplierId || null);
      lines.push({
        ingredient_id: ing.id,
        name: ing.name,
        unit: ing.unit,
        current_stock: stock,
        par: par,
        daily_rate: Math.round(daily * 10) / 10,
        suggested_qty: suggestedQty,
        supplier_id: chosenSupplier,
        supplier_name: chosenSupplier ? (supplierById.get(chosenSupplier) ?? null) : null,
        unit_price: cat?.unit_price ?? null,
        estimated_cost: cat?.unit_price != null ? Math.round(cat.unit_price * suggestedQty * 100) / 100 : null,
        negative: stock < 0,
      });
    }
    lines.sort((a, b) => Number(b.negative) - Number(a.negative) || b.estimated_cost - a.estimated_cost || a.name.localeCompare(b.name));
    return NextResponse.json({
      lines,
      metadata: {
        total: lines.length,
        critical: lines.filter(l => l.negative).length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
