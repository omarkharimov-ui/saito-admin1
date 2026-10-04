import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { groqChat, parseJsonFromText } from '@/lib/groq';

// 13c (the "our AI is better" flagship): a weekly-style LLM digest over the
// DETERMINISTIC stats below — depleting items, shrinkage leaders, freshness
// (batches nearing expiry), negative debt, supplier price drift. The LLM
// narrates + prioritizes (max 6 cards); if the key is absent the endpoint
// still returns the raw stats (resilience, no silent empty feed).
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const supabase = svc();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();
    const in3d = new Date();
    in3d.setDate(in3d.getDate() + 3);

    const [ingRes, logRes, batchRes, poRes] = await Promise.all([
      supabase.from('ingredients').select('id, name, unit, current_stock, critical_limit, average_cost_per_unit'),
      supabase.from('inventory_logs').select('ingredient_id, type, quantity, cost_per_unit').gte('created_at', sinceIso),
      supabase.from('stock_batches').select('ingredient_id, qty, expiry_date').lt('expiry_date', in3d.toISOString()).gt('qty', 0),
      supabase.from('purchase_order_items').select('product_name, unit_cost').gte('created_at', sinceIso),
    ]);
    if (ingRes.error) throw ingRes.error;
    const ings: any[] = ingRes.data ?? [];

    // depleting: 30d burn rate → days left
    const burn: Record<string, number> = {};
    for (const l of logRes.data ?? []) {
      if (l.type === 'order_consumption' || l.type === 'waste') burn[l.ingredient_id] = (burn[l.ingredient_id] || 0) + Math.abs(Number(l.quantity) || 0);
    }
    const depleting = ings
      .map((i) => {
        const daily = (burn[i.id] || 0) / 30;
        const stock = Number(i.current_stock) || 0;
        return { id: i.id, name: i.name, unit: i.unit, stock, days_left: daily > 0 ? Math.max(0, stock / daily) : null };
      })
      .filter((d) => d.days_left !== null && d.days_left < 5 && d.stock > 0)
      .sort((a, b) => (a.days_left! - b.days_left!))
      .slice(0, 5)
      .map((d) => ({ name: d.name, unit: d.unit, days_left: Math.round(d.days_left! * 10) / 10, stock: d.stock }));

    // shrinkage leaders (waste cost)
    const waste: Record<string, { name: string; unit: string; qty: number; cost: number }> = {};
    for (const i of ings) waste[i.id] = { name: i.name, unit: i.unit, qty: 0, cost: 0 };
    for (const l of logRes.data ?? []) {
      if (l.type !== 'waste' || !waste[l.ingredient_id]) continue;
      waste[l.ingredient_id].qty += Math.abs(Number(l.quantity) || 0);
      waste[l.ingredient_id].cost += Math.abs(Number(l.quantity) || 0) * (Number(l.cost_per_unit) || 0);
    }
    const shrinkage = Object.values(waste).filter((w) => w.qty > 0).sort((a, b) => b.cost - a.cost).slice(0, 5)
      .map((w) => ({ name: w.name, unit: w.unit, qty: Math.round(w.qty * 100) / 100, cost: Math.round(w.cost) }));

    // freshness: batches expiring ≤3d (or expired)
    const freshness = (batchRes.data ?? [])
      .map((b: any) => ({
        name: ings.find((i) => i.id === b.ingredient_id)?.name || 'Naməlum',
        qty: b.qty,
        expiry_date: b.expiry_date,
        expired: new Date(b.expiry_date) < new Date(),
      }))
      .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)))
      .slice(0, 5);

    // negative debt
    const negative = ings.filter((i) => (Number(i.current_stock) || 0) < 0)
      .map((i) => ({ name: i.name, unit: i.unit, stock: i.current_stock }))
      .sort((a, b) => a.stock - b.stock);

    // supplier price drift: latest PO unit_cost vs avg cost (top movers)
    const latestPoCost: Record<string, number> = {};
    for (const p of poRes.data ?? []) {
      const k = String(p.product_name).toLowerCase().trim();
      if (p.unit_cost > 0) latestPoCost[k] = p.unit_cost; // last-write wins per name
    }
    const priceDrift = ings
      .map((i) => {
        const poCost = latestPoCost[String(i.name).toLowerCase().trim()];
        const avg = Number(i.average_cost_per_unit) || 0;
        if (!poCost || !avg) return null;
        const pct = Math.round(((poCost - avg) / avg) * 1000) / 10;
        return Math.abs(pct) >= 8 ? { name: i.name, avg_cost: avg, latest_po_cost: poCost, drift_pct: pct } : null;
      })
      .filter(Boolean)
      .slice(0, 5) as { name: string; avg_cost: number; latest_po_cost: number; drift_pct: number }[];

    const stats = { depleting, shrinkage, freshness, negative, price_drift: priceDrift };
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ cards: [], data_only: true, stats, generated_at: new Date().toISOString() });
    }

    const prompt = [
      'Restoran inventory statistikası (30 gün). Linq, prioritetli, AZƏRBAYCAN dilində məsləhət kartları ver (max 6).',
      JSON.stringify(stats, null, 1),
      '',
      'Qaydalar: (1) təhlükəli olanı əvvəl (tükənən/expired/nəfs stok), (2) hər kartda konkret rəqəm olsun, (3) "sifariş et / sayım et / throw before expiry" kimi ACTION ver.',
      'STRICT JSON (başqa text YOX): {"cards":[{"severity":"high|medium|info","title":"başlıq (≤60 simvol)","body":"1-2 cümlə + rəqəmlər + təklif"}]}',
    ].join('\n');
    const aiText = await groqChat(
      'Sən restoran inventory konsulu. YALNIZ valid JSON cavab ver.',
      prompt,
      { maxTokens: 1100, temperature: 0.3 }
    );
    const parsed = parseJsonFromText<{ cards?: any[] }>(aiText);
    const cards = (parsed?.cards || []).slice(0, 6).map((c) => ({
      severity: ['high', 'medium', 'info'].includes(c.severity) ? c.severity : 'info',
      title: String(c.title || 'Məsləhət').slice(0, 90),
      body: String(c.body || ''),
    }));

    return NextResponse.json({ cards, data_only: cards.length === 0, stats, generated_at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
