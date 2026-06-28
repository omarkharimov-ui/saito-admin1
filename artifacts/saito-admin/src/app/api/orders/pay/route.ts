import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { deductStockForOrder } from '@/lib/stockAutomation';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { order_id, payment_method, cash_amount, card_amount, tip_amount } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const s = svc();

    const [orderRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/orders?id=eq.${order_id}&select=*`, { headers: s.headers }),
    ]);

    if (!orderRes.ok) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orders[0];

    if (order.status === 'paid') {
      return NextResponse.json({ error: 'Order is already paid' }, { status: 409 });
    }

    const updateData: Record<string, any> = {
      status: 'paid',
      payment_method: payment_method || 'card',
      paid_amount: (cash_amount || 0) + (card_amount || 0),
      kitchen_status: null,
    };
    if (tip_amount !== undefined) updateData.tip_amount = tip_amount;

    const updateRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${order_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify(updateData),
    });

    if (!updateRes.ok) {
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    if (order.table_number) {
      const childrenRes = await fetch(
        `${s.url}/rest/v1/orders?select=id&merged_into=eq.${order_id}`,
        { headers: s.headers }
      );
      const children = await childrenRes.json();
      if (children?.length) {
        for (const child of children) {
          const childRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${child.id}`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify({ status: 'paid', kitchen_status: null }),
          });
          if (!childRes.ok) {
            console.error(`[pay] Failed to update merged child order ${child.id}`);
          }
        }
      }

      const tableRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${order.table_number}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'empty',
          reservation_id: null,
          reservation_name: null,
          reservation_phone: null,
          reservation_time: null,
          guest_count: null,
          merged_into_table: null,
        }),
      });
      if (!tableRes.ok) {
        console.error(`[pay] Failed to update table_floors for table ${order.table_number}`);
      }
    }

    let stockDeduction = { deducted: 0, ingredientIds: [] as string[] };
    try {
      stockDeduction = await deductStockForOrder(order_id);
    } catch (stockErr) {
      console.error('[pay] Stock deduction failed (non-fatal):', stockErr);
    }

    return NextResponse.json({ success: true, stockDeduction });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
