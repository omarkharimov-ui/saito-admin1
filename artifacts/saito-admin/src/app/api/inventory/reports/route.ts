import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c (Toast COGS/AvT/shrinkage parity): one service-role endpoint, four
// report packs — the "Report" sub-tab renders all of them:
//  · valuation — current stock value (Σ stock × avg cost), negative flags
//  · cogs      — daily consumption cost (inventory_logs.order_consumption ×
//                cost_per_unit) + closing stock value trend
//  · avt       — actual-vs-theoretical per ingredient (theoretical =
//                recipes × sold quantity; actual = real consumption logs)
//  · shrinkage — weekly waste + unexplained variance per ingredient
// No LLM here — numbers are deterministic; the AI advisor (separate
// endpoint) narrates them.
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
    const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '30', 10) || 30, 7), 90);
    const supabase = svc();
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceIso = since.toISOString();

    const [ingRes, logRes, salesRes, recipeRes, batchRes] = await Promise.all([
      supabase.from('ingredients').select('id, name, unit, current_stock, average_cost_per_unit, critical_limit'),
      supabase
        .from('inventory_logs')
        .select('ingredient_id, type, quantity, cost_per_unit, created_at')
        .gte('created_at', sinceIso),
      supabase.from('order_items').select('product_name, quantity, created_at').gte('created_at', sinceIso),
      supabase.from('recipes').select('menu_item_id, product_name:products!inner(name), ingredient_id, quantity_required').eq('is_ai_suggested', false),
      supabase.from('stock_batches').select('id, ingredient_id, qty, expiry_date'),
    ]);
    if (ingRes.error) throw ingRes.error;

    const ings: any[] = ingRes.data ?? [];
    const ingMap = new Map(ings.map((i: any) => [i.id, i]));
    const logs: any[] = logRes.data ?? [];

    // ── valuation ─────────────────────────────────────────────────────────
    let stockValue = 0;
    const negatives: any[] = [];
    for (const i of ings) {
      stockValue += (Number(i.current_stock) || 0) * (Number(i.average_cost_per_unit) || 0);
      if ((Number(i.current_stock) || 0) < 0) negatives.push({ id: i.id, name: i.name, stock: i.current_stock, unit: i.unit });
    }

    // ── COGS (daily) ──────────────────────────────────────────────────────
    const byDay: Record<string, { cost: number; waste: number }> = {};
    let totalCogs = 0, totalWaste = 0;
    for (const l of logs) {
      const day = (l.created_at || '').slice(0, 10);
      const cost = Math.abs(Number(l.quantity) || 0) * (Number(l.cost_per_unit) || 0);
      if (l.type === 'order_consumption') { totalCogs += cost; (byDay[day] ||= { cost: 0, waste: 0 }).cost += cost; }
      else if (l.type === 'waste') { totalWaste += cost; (byDay[day] ||= { cost: 0, waste: 0 }).waste += cost; }
    }
    const cogsDays = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, cogs: Math.round(v.cost), waste: Math.round(v.waste) }));

    // ── AvT (actual vs theoretical) ───────────────────────────────────────
    const soldByProduct: Record<string, number> = {};
    for (const s of salesRes.data ?? []) soldByProduct[s.product_name] = (soldByProduct[s.product_name] || 0) + (Number(s.quantity) || 0);
    const actualByIng: Record<string, number> = {};
    for (const l of logs) if (l.type === 'order_consumption') actualByIng[l.ingredient_id] = (actualByIng[l.ingredient_id] || 0) + Math.abs(Number(l.quantity) || 0);

    const theoreticalByIng: Record<string, number> = {};
    for (const r of recipeRes.data ?? []) {
      const sold = soldByProduct[(r.product_name as any) || ''] || 0;
      if (sold === 0) continue;
      theoreticalByIng[r.ingredient_id] = (theoreticalByIng[r.ingredient_id] || 0) + sold * (Number(r.quantity_required) || 0);
    }
    const avt = ings
      .map((i: any) => {
        const theoretical = Math.round((theoreticalByIng[i.id] || 0) * 100) / 100;
        const actual = Math.round((actualByIng[i.id] || 0) * 100) / 100;
        const variance = Math.round((actual - theoretical) * 100) / 100;
        const variancePct = theoretical > 0 ? Math.round((variance / theoretical) * 1000) / 10 : null;
        return { id: i.id, name: i.name, unit: i.unit, theoretical, actual, variance, variance_pct: variancePct };
      })
      .filter((r: any) => r.theoretical > 0 || r.actual > 0)
      .sort((a: any, b: any) => Math.abs(b.variance || 0) - Math.abs(a.variance || 0))
      .slice(0, 15);

    // ── shrinkage (weekly waste per ingredient) ───────────────────────────
    const shrinkByIng: Record<string, { qty: number; cost: number }> = {};
    for (const l of logs) {
      if (l.type !== 'waste') continue;
      const v = (shrinkByIng[l.ingredient_id] ||= { qty: 0, cost: 0 });
      v.qty += Math.abs(Number(l.quantity) || 0);
      v.cost += Math.abs(Number(l.quantity) || 0) * (Number(l.cost_per_unit) || 0);
    }
    const shrinkage = Object.entries(shrinkByIng)
      .map(([id, v]) => ({
        id,
        name: ingMap.get(id)?.name || 'Naməlum',
        unit: ingMap.get(id)?.unit || '',
        qty: Math.round(v.qty * 100) / 100,
        cost: Math.round(v.cost),
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 15);

    // ── freshness (batches nearing expiry) ────────────────────────────────
    const inDays = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString(); };
    const nowIso = new Date().toISOString();
    const expiring = (batchRes.data ?? [])
      .filter((b: any) => b.expiry_date && b.expiry_date <= inDays(3) && b.qty > 0)
      .sort((a: any, b: any) => String(a.expiry_date).localeCompare(String(b.expiry_date)))
      .map((b: any) => ({ id: b.id, name: ingMap.get(b.ingredient_id)?.name || 'Naməlum', unit: ingMap.get(b.ingredient_id)?.unit || '', qty: b.qty, expiry_date: b.expiry_date, expired: b.expiry_date < nowIso }));

    return NextResponse.json({
      days,
      generated_at: nowIso,
      valuation: {
        total_value: Math.round(stockValue),
        currency: 'AZN',
        ingredient_count: ings.length,
        negatives,
      },
      cogs: {
        total_cogs: Math.round(totalCogs),
        total_waste: Math.round(totalWaste),
        cogs_pct_of_sales: null, // sales join = 13c-E (needs order totals)
        by_day: cogsDays,
      },
      avt,
      shrinkage,
      freshness: { expiring, batches_total: (batchRes.data ?? []).length },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
