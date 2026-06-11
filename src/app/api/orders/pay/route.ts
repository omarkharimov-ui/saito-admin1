import { NextRequest, NextResponse } from 'next/server';
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
      paid_amount: (cash_amount || 0) + (card_amount || 0),
      kitchen_status: null,
    };
    if (tip_amount !== undefined) updateData.tip_amount = tip_amount;

    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateData),
    });

    if (!updateRes.ok) {
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    if (order.table_number) {
      const { data: children } = await (
        await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id&merged_into=eq.${order_id}`, { headers })
      ).json().catch(() => ({ data: [] }));

      if (children && children.length > 0) {
        const childIds = children.map((c: { id: string }) => c.id);
        await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=in.(${childIds.join(',')})`, { method: 'DELETE', headers }).catch(() => {}),
          fetch(`${SUPABASE_URL}/rest/v1/orders?id=in.(${childIds.join(',')})`, { method: 'DELETE', headers }).catch(() => {}),
        ]);
      }
    }

    // ═══ STOCK DEDUCTION ═══
    // Sifariş ödənildi — avtomatik stokdan ingredient-ləri azalt
    try {
      await deductStockForOrder(order_id);
    } catch (stockErr) {
      console.error('[pay] Stock deduction failed (non-fatal):', stockErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
