import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PATCH(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const supabase = svc();

    // Reuse the same logic as GET to compute stats
    const { data: orders } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .eq('supplier_id', id)
      .order('ordered_at', { ascending: false });

    const totalOrders = orders?.length || 0;
    const receivedOrders = orders?.filter(o => o.status === 'received') || [];
    const partialOrders = orders?.filter(o => o.status === 'partial') || [];
    const cancelledOrders = orders?.filter(o => o.status === 'cancelled') || [];

    const onTimeRate = totalOrders > 0
      ? Math.round(((receivedOrders.length) / totalOrders) * 100)
      : null;

    const priceMap = new Map<string, number[]>();
    for (const o of orders || []) {
      for (const item of (o as any).purchase_order_items || []) {
        const key = item.product_name?.toLowerCase().trim();
        if (key && item.unit_cost > 0) {
          if (!priceMap.has(key)) priceMap.set(key, []);
          priceMap.get(key)!.push(Number(item.unit_cost));
        }
      }
    }
    let priceStability: number | null = null;
    const variances: number[] = [];
    for (const prices of priceMap.values()) {
      if (prices.length >= 2) {
        const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
        const maxDev = Math.max(...prices.map(p => Math.abs(p - avg) / avg));
        variances.push(maxDev);
      }
    }
    if (variances.length > 0) {
      const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;
      priceStability = Math.round(Math.max(0, 100 - avgVariance * 100));
    }

    const discrepancyRate = totalOrders > 0
      ? Math.round((partialOrders.length / totalOrders) * 100)
      : null;

    const delayRate = totalOrders > 0
      ? Math.round(((cancelledOrders.length + (orders?.filter(o => o.status === 'sent' || o.status === 'draft')?.length || 0)) / totalOrders) * 100)
      : null;

    const scores: number[] = [];
    if (onTimeRate !== null) scores.push(onTimeRate * 0.35);
    if (priceStability !== null) scores.push(priceStability * 0.25);
    if (discrepancyRate !== null) scores.push(Math.max(0, 100 - discrepancyRate) * 0.25);
    if (delayRate !== null) scores.push(Math.max(0, 100 - delayRate) * 0.15);
    const weightSum = (onTimeRate !== null ? 0.35 : 0) + (priceStability !== null ? 0.25 : 0) + (discrepancyRate !== null ? 0.25 : 0) + (delayRate !== null ? 0.15 : 0);
    const compositeScore = weightSum > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / weightSum) : null;

    const { error } = await supabase
      .from('suppliers')
      .update({
        score: compositeScore,
        total_orders: totalOrders,
        on_time_delivery_rate: onTimeRate ? Math.round(onTimeRate / 100 * 10000) / 100 : null,
        avg_price_stability: priceStability ?? null,
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      totalOrders,
      receivedOrders: receivedOrders.length,
      partialOrders: partialOrders.length,
      cancelledOrders: cancelledOrders.length,
      onTimeRate,
      priceStability,
      discrepancyRate,
      delayRate,
      compositeScore,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
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
      .select('*, purchase_order_items(*)')
      .eq('supplier_id', id)
      .order('ordered_at', { ascending: false });

    const totalOrders = orders?.length || 0;
    const receivedOrders = orders?.filter(o => o.status === 'received') || [];
    const partialOrders = orders?.filter(o => o.status === 'partial') || [];
    const cancelledOrders = orders?.filter(o => o.status === 'cancelled') || [];

    const onTimeRate = totalOrders > 0
      ? Math.round(((receivedOrders.length) / totalOrders) * 100)
      : null;

    // price stability: compare unit_cost across PO items for same product names
    const priceMap = new Map<string, number[]>();
    for (const o of orders || []) {
      for (const item of (o as any).purchase_order_items || []) {
        const key = item.product_name?.toLowerCase().trim();
        if (key && item.unit_cost > 0) {
          if (!priceMap.has(key)) priceMap.set(key, []);
          priceMap.get(key)!.push(Number(item.unit_cost));
        }
      }
    }
    let priceStability: number | null = null;
    const variances: number[] = [];
    for (const prices of priceMap.values()) {
      if (prices.length >= 2) {
        const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
        const maxDev = Math.max(...prices.map(p => Math.abs(p - avg) / avg));
        variances.push(maxDev);
      }
    }
    if (variances.length > 0) {
      const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;
      priceStability = Math.round(Math.max(0, 100 - avgVariance * 100));
    }

    // invoice discrepancy rate (simplified: based on partial orders)
    const discrepancyRate = totalOrders > 0
      ? Math.round((partialOrders.length / totalOrders) * 100)
      : null;

    // delay rate (orders not received)
    const delayRate = totalOrders > 0
      ? Math.round(((cancelledOrders.length + (orders?.filter(o => o.status === 'sent' || o.status === 'draft')?.length || 0)) / totalOrders) * 100)
      : null;

    // composite score
    const scores: number[] = [];
    if (onTimeRate !== null) scores.push(onTimeRate * 0.35);
    if (priceStability !== null) scores.push(priceStability * 0.25);
    if (discrepancyRate !== null) scores.push(Math.max(0, 100 - discrepancyRate) * 0.25);
    if (delayRate !== null) scores.push(Math.max(0, 100 - delayRate) * 0.15);
    const compositeScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / (scores.reduce((s, v, i) => s + [0.35, 0.25, 0.25, 0.15][i], 0))) : null;

    // price history (last 10 item prices)
    const priceHistory = [];
    for (const o of orders || []) {
      for (const item of (o as any).purchase_order_items || []) {
        if (item.unit_cost > 0) {
          priceHistory.push({
            date: o.ordered_at,
            product: item.product_name,
            cost: Number(item.unit_cost),
            quantity: Number(item.quantity),
            unit: item.unit,
          });
        }
      }
    }

    // recent POs
    const recentOrders = (orders || []).slice(0, 10).map(o => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      total_amount: Number(o.total_amount),
      ordered_at: o.ordered_at,
      received_at: o.received_at,
      items_count: (o as any).purchase_order_items?.length || 0,
    }));

    return NextResponse.json({
      totalOrders,
      receivedOrders: receivedOrders.length,
      partialOrders: partialOrders.length,
      cancelledOrders: cancelledOrders.length,
      onTimeRate,
      priceStability,
      discrepancyRate,
      delayRate,
      compositeScore,
      priceHistory: priceHistory.slice(-20),
      recentOrders,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
