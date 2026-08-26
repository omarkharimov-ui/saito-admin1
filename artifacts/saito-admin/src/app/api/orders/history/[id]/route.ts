import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const { id } = await params;
    const s = svc();

    const orderRes = await fetch(
      `${s.url}/rest/v1/orders?id=eq.${id}&select=*,order_items(id,order_id,product_id,product_name,quantity,unit_price,total_price,variant_id,variant_name,modifiers,special_notes,combo_group_id,is_combo_parent,parent_order_item_id,kitchen_status,served_quantity,prepared_quantity,seat_number,course,products(name_az,name_en))`,
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
      `${s.url}/rest/v1/order_payments?order_id=eq.${id}&order=created_at.asc`,
      { headers: s.headers }
    );
    const payments = paymentsRes.ok ? await paymentsRes.json() : [];

    const auditRes = await fetch(
      `${s.url}/rest/v1/audit_logs?order_id=eq.${id}&order=created_at.asc&limit=100`,
      { headers: s.headers }
    );
    const auditLogs = auditRes.ok ? await auditRes.json() : [];

    return NextResponse.json({ order, payments, auditLogs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
