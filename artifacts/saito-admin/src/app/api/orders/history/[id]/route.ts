import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { id } = await params;
    const s = svc();

    const orderRes = await fetch(
      `${s.url}/rest/v1/orders?id=eq.${id}&select=*,campaigns(name),order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,variant_id,variant_name,modifiers,special_notes,combo_group_id,is_combo_parent,parent_order_item_id,kitchen_status,served_quantity,prepared_quantity,seat_number,course,products(name_az,name_en))`,
      { headers: s.headers }
    );

    if (!orderRes.ok) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orders[0];

    const paymentsRes = await fetch(
      `${s.url}/rest/v1/payments?order_id=eq.${id}&order=created_at.asc`,
      { headers: s.headers }
    );
    const payments = paymentsRes.ok ? await paymentsRes.json() : [];

    // AUDIT 2026-09-23 (root cause of the "weak timeline"): order-scoped
    // audit rows are written with the order id in `record_id` (table_name
    // = 'orders'), while the `order_id` column is NULL on all 440 rows.
    // Querying order_id only → the timeline was ALWAYS empty.
    const auditRes = await fetch(
      `${s.url}/rest/v1/audit_logs?or(order_id.eq.${id},record_id.eq.${id})&order=created_at.asc&limit=100`,
      { headers: s.headers }
    );
    let auditLogs: any[] = auditRes.ok ? await auditRes.json() : [];

    // Staff attribution: rows carry performed_by (staff id) with staff_name
    // usually NULL — resolve names server-side in one batch query.
    try {
      const staffIds = Array.from(new Set(
        auditLogs.map(l => l.performed_by).filter((x: any) => x && String(x).length > 8)
      )) as string[];
      if (staffIds.length > 0) {
        const inClause = staffIds.map(x => `eq.${x}`).join(',');
        const staffRes = await fetch(
          `${s.url}/rest/v1/staff?select=id,name&id=in.(${inClause})`,
          { headers: s.headers }
        );
        if (staffRes.ok) {
          const staff = await staffRes.json();
          const nameById: Record<string, string> = {};
          for (const st of staff as any[]) nameById[st.id] = st.name;
          auditLogs = auditLogs.map(l => ({
            ...l,
            staff_name: l.staff_name || nameById[l.performed_by] || null,
          }));
        }
      }
    } catch { /* keep raw logs */ }

    return NextResponse.json({ order, payments, auditLogs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
