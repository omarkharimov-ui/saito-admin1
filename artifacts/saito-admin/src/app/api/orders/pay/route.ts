import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { deductStockForOrder } from '@/lib/stockAutomation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const { order_id, payment_method, cash_amount, card_amount, tip_amount } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const [orderRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order_id}&select=*`, { headers }),
    ]);

    if (!orderRes.ok) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orders[0];

    const updateData: Record<string, any> = {
      status: 'paid',
      payment_method: payment_method || 'card',
      paid_amount: (cash_amount || 0) + (card_amount || 0) || order.total_amount || 0,
      kitchen_status: null,
    };
    if (tip_amount !== undefined) updateData.tip_amount = tip_amount;

    // Update primary order to paid
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateData),
    });

    if (!updateRes.ok) {
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    // Also mark child orders (merged_into = order_id) as paid
    if (order.table_number) {
      const childrenRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?select=id&merged_into=eq.${order_id}`,
        { headers }
      );
      const children = await childrenRes.json();
      if (children?.length) {
        for (const child of children) {
          await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${child.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'paid', kitchen_status: null }),
          });
        }
      }
    }

    // ═══ STOCK DEDUCTION ═══
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
