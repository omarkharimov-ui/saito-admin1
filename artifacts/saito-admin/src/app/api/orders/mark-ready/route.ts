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
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const { order_id } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const s = svc();

    // Fetch current order state
    const orderRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${order_id}&select=*`, { headers: s.headers });
    if (!orderRes.ok) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const orders = await orderRes.json();
    const order = orders?.[0];
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Already paid → no stock deduction needed (already done at payment)
    if (order.status === 'paid') {
      return NextResponse.json({ success: true, skipped: true, reason: 'already_paid' });
    }

    // Deduct stock now that kitchen has prepared the items
    let stockDeduction = { deducted: 0, ingredientIds: [] as string[] };
    try {
      stockDeduction = await deductStockForOrder(order_id);
    } catch (stockErr) {
      console.error('[mark-ready] Stock deduction failed (non-fatal):', stockErr);
    }

    return NextResponse.json({ success: true, stockDeduction });
  } catch (error: any) {
    console.error('[API /orders/mark-ready] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
