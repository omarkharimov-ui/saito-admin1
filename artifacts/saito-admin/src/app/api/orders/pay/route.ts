import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { deductStockForOrder } from '@/lib/stockAutomation';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();

    const { order_id, payment_method, cash_amount, card_amount, tip_amount } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // ─── 1. Fetch order ───
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id, table_number, status, total_amount, paid_amount, reservation_id, discount_type, discount_value, tip_amount, guest_count, version')
      .eq('id', order_id);

    if (fetchError || !orders || orders.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orders[0];

    if (order.status === 'paid') {
      return NextResponse.json({ error: 'Order is already paid' }, { status: 409 });
    }

    const paidAmount = (cash_amount || 0) + (card_amount || 0);
    const now = new Date().toISOString();

    // ─── 2. Mark order paid ───
    const updatePayload: Record<string, any> = {
      status: 'paid',
      paid_amount: paidAmount,
      payment_method: payment_method || 'card',
      paid_at: now,
      kitchen_status: null,
    };
    if (tip_amount !== undefined) updatePayload.tip_amount = tip_amount;

    const { error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order_id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    // ─── 3. Handle table_floors + merged children + reservation ───
    if (order.table_number) {
      const tablesToFree: number[] = [order.table_number];

      // 3a. Find merged children of THIS order (child orders merged into parent)
      const { data: childOrders } = await supabase
        .from('orders')
        .select('id, table_number')
        .eq('merged_into', order_id);

      if (childOrders) {
        for (const child of childOrders) {
          await supabase
            .from('orders')
            .update({ status: 'paid', paid_at: now, kitchen_status: null })
            .eq('id', child.id);

          if (child.table_number) {
            tablesToFree.push(child.table_number);
          }
        }
      }

      // 3b. Free all affected tables
      for (const tn of [...new Set(tablesToFree)]) {
        await supabase
          .from('table_floors')
          .update({
            status: 'empty',
            reservation_id: null,
            guest_count: null,
            last_activity_at: now,
          })
          .eq('table_number', tn);
      }

      // 3c. Complete linked reservation
      if (order.reservation_id) {
        await supabase
          .from('reservations')
          .update({ status: 'completed', completed_at: now })
          .eq('id', order.reservation_id);
      }
    }

    // ─── 4. Stock deduction ───
    let stockResult = { deducted: 0, ingredientIds: [] as string[] };
    try {
      stockResult = await deductStockForOrder(order_id);
    } catch (stockErr) {
      console.error('[pay] Stock deduction failed (non-fatal):', stockErr);
    }

    // ─── 5. Audit log ───
    try {
      await supabase.from('transaction_logs').insert({
        action: 'order_paid',
        status: 'completed',
        details: JSON.stringify({
          order_id,
          table_number: order.table_number,
          total_amount: order.total_amount,
          paid_amount: paidAmount,
          payment_method: payment_method || 'card',
          tip_amount: tip_amount || order.tip_amount || 0,
          cash_amount: cash_amount || 0,
          card_amount: card_amount || 0,
          reservation_id: order.reservation_id,
          stock_deducted: stockResult.deducted,
        }),
        table_name: 'orders',
        record_id: order_id,
        created_at: now,
      });
    } catch (auditErr) {
      console.error('[pay] Audit log failed (non-fatal):', auditErr);
    }

    // ─── 6. Campaign usage tracking ───
    if (order.discount_type && order.discount_value) {
      try {
        const discountValue = Number(order.discount_value);
        if (discountValue > 0) {
          await supabase.from('campaign_usage').insert({
            campaign_id: null,
            order_id,
            discount_amount: Math.abs(discountValue),
            discount_type: order.discount_type,
            created_at: now,
          });
        }
      } catch (campErr) {
        console.error('[pay] Campaign tracking failed (non-fatal):', campErr);
      }
    }

    return NextResponse.json({
      success: true,
      paid_amount: paidAmount,
      stock_deducted: stockResult.deducted,
    });
  } catch (error: any) {
    console.error('[API /orders/pay] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
