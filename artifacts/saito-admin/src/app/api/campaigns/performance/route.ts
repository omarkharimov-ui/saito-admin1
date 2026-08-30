import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();

    const { data: campaigns, error: campErr } = await supabase
      .from('campaigns')
      .select(`
        *,
        rules:campaign_rules(*),
        targets:campaign_targets(*),
        schedules:campaign_schedules(*)
      `)
      .order('created_at', { ascending: false });

    if (campErr) throw campErr;

    const campaignIds = (campaigns || []).map((c: any) => c.id).filter(Boolean);

    let orderMap = new Map<string, { total_orders: number; unique_customers: Set<string>; total_discount: number; total_items: number; last_used: string | null }>();

    if (campaignIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, campaign_id, discount_amount, customer_id, created_at, order_items(quantity)')
        .in('campaign_id', campaignIds)
        .not('campaign_id', 'is', null);

      for (const order of (orders || []) as any[]) {
        const cid = order.campaign_id;
        if (!cid) continue;
        if (!orderMap.has(cid)) {
          orderMap.set(cid, {
            total_orders: 0,
            unique_customers: new Set(),
            total_discount: 0,
            total_items: 0,
            last_used: null,
          });
        }
        const stats = orderMap.get(cid)!;
        stats.total_orders += 1;
        if (order.customer_id) stats.unique_customers.add(order.customer_id);
        stats.total_discount += Number(order.discount_amount) || 0;
        if (order.order_items) {
          for (const item of order.order_items) {
            stats.total_items += Number(item.quantity) || 0;
          }
        }
        if (!stats.last_used || order.created_at > stats.last_used) {
          stats.last_used = order.created_at;
        }
      }
    }

    const performance = (campaigns || []).map((c: any) => {
      const stats = orderMap.get(c.id);
      return {
        id: c.id,
        title: c.title || c.name || '',
        name: c.name || c.title || '',
        type: c.type,
        status: c.is_active === false ? 'inactive' : (c.status || 'active'),
        priority: c.priority || 0,
        total_orders: stats?.total_orders ?? c.current_uses ?? 0,
        unique_customers: stats ? stats.unique_customers.size : null,
        total_discount_given: stats?.total_discount ?? null,
        total_items_sold: stats?.total_items ?? null,
        avg_discount_per_order: stats && stats.total_orders > 0
          ? Math.round((stats.total_discount / stats.total_orders) * 100) / 100
          : null,
        last_used_at: stats?.last_used ?? null,
        campaign_created_at: c.created_at,
      };
    });

    return NextResponse.json({ data: performance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
