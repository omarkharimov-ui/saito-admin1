import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { order_id, type = 'customer' } = await req.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    const s = svc();

    const orderRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${order_id}&select=*,order_items(*,products(name_az,name_en,name_ru,translations))`, { headers: s.headers });
    const orders = await orderRes.json();
    const order = Array.isArray(orders) ? orders[0] : null;

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const items = order.order_items || [];
    const receipt = {
      type,
      order_id: order.id,
      table_number: order.table_number,
      status: order.status,
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      paid_amount: order.paid_amount,
      tip_amount: order.tip_amount,
      discount_amount: order.discount_amount,
      discount_type: order.discount_type,
      created_at: order.created_at,
      paid_at: order.paid_at,
      items: items.map((it: any) => ({
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        modifiers: it.modifiers,
      })),
    };

    return NextResponse.json({ success: true, receipt });
  } catch (error: any) {
    console.error('[API /orders/reprint] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
