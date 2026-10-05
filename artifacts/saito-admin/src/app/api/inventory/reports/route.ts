import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c (Toast COGS/AvT/shrinkage parity): one service-role endpoint, four
// report packs — the "Report" sub-tab renders all of them:
//  · valuation — current stock value (Σ stock × avg cost), negative flags
//  · cogs      — daily consumption cost (inventory_logs.order_consumption ×
//                cost_per_unit; 13n-2: frozen RPC doesn't snapshot cost —
//                609/661 rows have cost_per_unit NULL — fallback = ingredient
//                current average_cost_per_unit)
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
    // 13n-2: the frozen consumption path does not snapshot unit cost, so
    // most order_consumption rows have cost_per_unit = NULL (DB-verified:
    // 0/67 in the 30d window). Fall back to the ingredient's current average
    // cost — deterministic, service-role, no frozen-code changes.
    const ingCost = new Map(ings.map(i => [i.id, Number(i.average_cost_per_unit) || 0]));
    const byDay: Record<string, { cost: number; waste: number }> = {};
    let totalCogs = 0, totalWaste = 0;
    for (const l of logs) {
      const day = (l.created_at || '').slice(0, 10);
      const unitCost = Number(l.cost_per_unit) || ingCost.get(l.ingredient_id) || 0;
      const cost = Math.abs(Number(l.quantity) || 0) * unitCost;
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
      v.cost += Math.abs(Number(l.quantity) || 0) * (Number(l.cost_per_unit) || ingCost.get(l.ingredient_id) || 0);
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

    // ── 13d: shrinkage PATTERN (28g — Toast "track patterns of missing value") ──
    // Deterministic: waste log rows bucketed into Mon-start weeks, weekday
    // distribution, and per-ingredient week-over-week trend.
    const patternSince = new Date(); patternSince.setDate(patternSince.getDate() - 28);
    const patternSinceIso = patternSince.toISOString();
    const wasteLogs = logs.filter(l => l.type === 'waste' && (l.created_at || '') >= patternSinceIso);
    const mondayOf = (d: Date) => {
      const x = new Date(d); x.setHours(0, 0, 0, 0);
      const dow = (x.getDay() + 6) % 7; // Mon=0
      x.setDate(x.getDate() - dow);
      return x;
    };
    const nowMonday = mondayOf(new Date());
    const weeks: { start: string; cost: number; qty: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const s = new Date(nowMonday); s.setDate(s.getDate() - 7 * w);
      weeks.push({ start: s.toISOString().slice(0, 10), cost: 0, qty: 0 });
    }
    const byWeekday: { cost: number }[] = Array.from({ length: 7 }, () => ({ cost: 0 }));
    const patByIng: Record<string, { cost: number; qty: number; prev: number; last: number }> = {};
    for (const l of wasteLogs) {
      const qtyAbs = Math.abs(Number(l.quantity) || 0);
      const cost = qtyAbs * (Number(l.cost_per_unit) || ingCost.get(l.ingredient_id) || 0);
      const dt = new Date(l.created_at);
      const ws = mondayOf(dt).toISOString().slice(0, 10);
      const idx = weeks.findIndex(x => x.start === ws);
      if (idx >= 0) {
        weeks[idx].cost += cost;
        weeks[idx].qty += qtyAbs;
        const v = (patByIng[l.ingredient_id] ||= { cost: 0, qty: 0, prev: 0, last: 0 });
        v.cost += cost; v.qty += qtyAbs;
        if (idx === 2) v.prev += cost;
        if (idx === 3) v.last += cost;
      }
      byWeekday[(dt.getDay() + 6) % 7].cost += cost;
    }
    const lastW = weeks[3].cost, prevW = weeks[2].cost;
    const shrinkage_pattern = {
      window_days: 28,
      total_cost: Math.round(weeks.reduce((s, w) => s + w.cost, 0)),
      weeks: weeks.map(w => ({ start: w.start, cost: Math.round(w.cost), qty: Math.round(w.qty * 100) / 100 })),
      week_over_week_pct: prevW > 0 ? Math.round(((lastW - prevW) / prevW) * 1000) / 10 : null,
      by_weekday: byWeekday.map(d => ({ cost: Math.round(d.cost) })),
      top: Object.entries(patByIng)
        .map(([id, v]) => ({
          id,
          name: ingMap.get(id)?.name || 'Naməlum',
          unit: ingMap.get(id)?.unit || '',
          cost: Math.round(v.cost),
          qty: Math.round(v.qty * 100) / 100,
          trend_pct: v.prev > 0 ? Math.round(((v.last - v.prev) / v.prev) * 1000) / 10 : (v.last > 0 ? 100 : null),
        }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5),
    };

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
      shrinkage_pattern,
      freshness: { expiring, batches_total: (batchRes.data ?? []).length },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
