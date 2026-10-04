import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13a (E2E r26 S0 root cause): the audit page + stock "Stok Tarixçəsi" read
// inventory_logs DIRECTLY from the browser client. The table's RLS SELECT
// policy gates non-order rows on `is_superadmin()` = current_setting
// ('app.current_role'), which the pooler session does NOT set for user JWTs
// → 200 + 0 rows (silent empty pages) while service-role writes succeed.
// This route serves the same data via the service role (the pattern every
// other working board uses) and folds in the order context (table number,
// product names) so the client makes ONE call.
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
    const ingredientId = searchParams.get('ingredient_id');
    const since = searchParams.get('since');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1), 500);

    const supabase = svc();
    let q = supabase
      .from('inventory_logs')
      .select('id, type, quantity, cost_per_unit, reason, order_id, created_at, ingredient:ingredients(name, unit)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (ingredientId) q = q.eq('ingredient_id', ingredientId);
    if (since) q = q.gte('created_at', since);

    const { data: logs, error } = await q;
    if (error) throw error;

    // Order context in one round-trip each (service role — RLS-free).
    const orderIds = [...new Set((logs ?? []).map(l => l.order_id).filter(Boolean))] as string[];
    const orderMap: Record<string, { table_number: number | string | null }> = {};
    const productMap: Record<string, string[]> = {};
    if (orderIds.length > 0) {
      const [ordersRes, itemsRes] = await Promise.all([
        supabase.from('orders').select('id, table_number').in('id', orderIds),
        supabase.from('order_items').select('order_id, product_name').in('order_id', orderIds),
      ]);
      for (const o of ordersRes.data ?? []) orderMap[o.id] = { table_number: o.table_number };
      for (const it of itemsRes.data ?? []) {
        (productMap[it.order_id] ||= []).push(it.product_name);
      }
    }

    const rows = (logs ?? []).map(l => ({
      id: l.id,
      type: l.type,
      quantity: l.quantity,
      cost_per_unit: l.cost_per_unit,
      reason: l.reason,
      order_id: l.order_id,
      created_at: l.created_at,
      ingredient_name: (l.ingredient as any)?.name || 'Naməlum',
      ingredient_unit: (l.ingredient as any)?.unit || '',
      table_number: l.order_id ? (orderMap[l.order_id]?.table_number ?? null) : null,
      product_names: l.order_id ? (productMap[l.order_id] ?? []) : [],
    }));
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
