import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { PriceAnomaly } from '@/types/inventory';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const supabase = svc();

    const { data: orders } = await supabase
      .from('purchase_orders')
      .select('id, order_number, created_at')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false });

    if (!orders?.length) {
      return NextResponse.json({ anomalies: [], metadata: { total_orders: 0 } });
    }

    const orderIds = orders.map(o => o.id);

    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('*')
      .in('purchase_order_id', orderIds);

    if (!items?.length) {
      return NextResponse.json({ anomalies: [], metadata: { total_orders: orders.length, total_items: 0 } });
    }

    const productGroups: Record<string, { costs: number[]; dates: string[] }> = {};
    for (const item of items) {
      if (!productGroups[item.product_name]) {
        productGroups[item.product_name] = { costs: [], dates: [] };
      }
      productGroups[item.product_name].costs.push(item.unit_cost);
      productGroups[item.product_name].dates.push(item.created_at);
    }

    const anomalies: PriceAnomaly[] = [];

    for (const [productName, group] of Object.entries(productGroups)) {
      if (group.costs.length < 2) continue;

      const sorted = [...group.costs].sort((a, b) => a - b);
      const avg = group.costs.reduce((s, c) => s + c, 0) / group.costs.length;
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const latest = group.costs[group.costs.length - 1];
      const latestDate = group.dates[group.dates.length - 1];

      const variancePct = avg > 0 ? ((latest - avg) / avg) * 100 : 0;

      if (Math.abs(variancePct) > 5) {
        anomalies.push({
          product_name: productName,
          current_unit_cost: latest,
          avg_unit_cost: Math.round(avg * 10000) / 10000,
          min_unit_cost: min,
          max_unit_cost: max,
          variance_pct: Math.round(variancePct * 100) / 100,
          occurrences: group.costs.length,
          last_occurrence: latestDate,
          severity: Math.abs(variancePct) > 20 ? 'high' : Math.abs(variancePct) > 10 ? 'medium' : 'low',
        });
      }
    }

    anomalies.sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct));

    return NextResponse.json({
      anomalies,
      metadata: {
        total_orders: orders.length,
        total_items: items.length,
        analyzed_products: Object.keys(productGroups).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
