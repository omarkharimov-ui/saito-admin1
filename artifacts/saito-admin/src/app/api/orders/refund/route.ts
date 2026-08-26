import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/**
 * POST /api/orders/refund
 *
 * Two modes:
 * 1. Item-level refund (with item_fate):
 *    { order_id, order_item_id, quantity, amount, item_fate: 'return_to_stock'|'waste', ... }
 *    → refund_with_inventory RPC
 *
 * 2. Order-level refund (legacy, no item_fate):
 *    { order_id, amount, method, reason }
 *    → complete_payment_atomic_v2 RPC
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission('payments.refund', ['cashier', 'admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(request, auth.authenticated)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  const supabase = await createAuthClient();
  const body = await request.json();
  const {
    order_id,
    order_item_id,
    quantity,
    amount,
    method,
    reason,
    reason_text,
    item_fate,
  } = body;

  if (!order_id) {
    return NextResponse.json({ error: 'order_id required' }, { status: 400 });
  }

  // ============================================================
  // MODE 1: Item-level refund with inventory fate
  // ============================================================
  if (order_item_id && item_fate) {
    if (!['return_to_stock', 'waste'].includes(item_fate)) {
      return NextResponse.json({ error: 'item_fate must be return_to_stock or waste' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('refund_with_inventory', {
      p_order_id: order_id,
      p_order_item_id: order_item_id,
      p_quantity: quantity || 1,
      p_amount: amount || 0,
      p_method: method || 'cash',
      p_item_fate: item_fate,
      p_reason: reason || 'customer_return',
      p_reason_text: reason_text || null,
      p_performed_by: auth.user?.id || null,
    });

    if (error) {
      console.error('[refund] refund_with_inventory RPC failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data && !data.success) {
      return NextResponse.json(data, { status: 400 });
    }

    return NextResponse.json(data);
  }

  // ============================================================
  // MODE 2: Order-level refund (legacy)
  // ============================================================
  if (!order_id || !amount) {
    return NextResponse.json({ error: 'order_id and amount required' }, { status: 400 });
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, paid_amount, refund_amount')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'Can only refund paid orders. Current: ' + order.status }, { status: 400 });
  }

  const totalRefunded = Number(order.refund_amount) || 0;
  const paidAmount = Number(order.paid_amount) || 0;
  if (totalRefunded + Number(amount) > paidAmount) {
    return NextResponse.json({
      error: `Refund amount (${amount}) exceeds remaining (${paidAmount - totalRefunded})`,
    }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('complete_payment_atomic_v2', {
    p_order_id: order_id,
    p_payments: JSON.stringify([{
      amount: Number(amount),
      method: method || 'cash',
      is_refund: true,
      reason_text: reason_text || reason || 'Müştəri şikayəti',
    }]),
    p_payment_method: method || 'cash',
    p_performed_by: auth.user?.id || null,
  });

  if (error) {
    console.error('[refund] RPC failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data && !data.success) {
    return NextResponse.json(data, { status: 400 });
  }

  return NextResponse.json(data);
}
