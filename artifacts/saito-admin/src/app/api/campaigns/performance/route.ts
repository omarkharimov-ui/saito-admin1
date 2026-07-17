import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'cashier']);
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();

    // The materialized `campaign_performance` view is not present in this
    // deployment, so derive the same shape directly from `campaigns`.
    // Usage metrics fall back to `current_uses` / 0 when no order history exists.
    const { data, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        rules:campaign_rules(*),
        targets:campaign_targets(*),
        schedules:campaign_schedules(*)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const performance = (data || []).map((c: any) => ({
      id: c.id,
      title: c.title || c.name || '',
      name: c.name || c.title || '',
      type: c.type,
      status: c.is_active === false ? 'inactive' : (c.status || 'active'),
      priority: c.priority || 0,
      total_orders: c.current_uses ?? 0,
      unique_customers: null,
      total_discount_given: null,
      total_items_sold: null,
      avg_discount_per_order: null,
      last_used_at: null,
      campaign_created_at: c.created_at,
    }));

    return NextResponse.json({ data: performance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
