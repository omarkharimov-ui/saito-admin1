import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

const REFUND_APPROVAL_THRESHOLD = 50;

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('payments.refund');
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const supabase = await createAuthClient();
    const s = svc();
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

    const refundAmount = Number(amount) || 0;

    // ============================================================
    // MODE 1: Item-level refund with inventory fate
    // ============================================================
    if (order_item_id && item_fate) {
      if (!['return_to_stock', 'waste'].includes(item_fate)) {
        return NextResponse.json({ error: 'item_fate must be return_to_stock or waste' }, { status: 400 });
      }

      // Check if approval is required
      if (refundAmount > REFUND_APPROVAL_THRESHOLD) {
        const { data: hasRefundApprove, error: approveErr } = await supabase.rpc('has_permission', {
          p_staff_id: auth.user!.id,
          p_permission: 'refund.approve',
        });

        if (approveErr || !hasRefundApprove) {
          // Create pending approval request
          const approvalRes = await fetch(`${s.url}/rest/v1/approval_requests`, {
            method: 'POST',
            headers: { ...s.headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              staff_id: auth.user.id,
              action_type: 'refund',
              entity_type: 'order',
              entity_id: order_id,
              amount: refundAmount,
              reason: reason_text || reason || null,
              old_values: { order_id, order_item_id, quantity, amount, method, item_fate },
              new_values: { refund_amount: refundAmount, method, item_fate },
              status: 'pending',
            }),
          });

          if (!approvalRes.ok) {
            const errText = await approvalRes.text();
            return NextResponse.json({ error: errText || 'Failed to create approval request' }, { status: 400 });
          }

          return NextResponse.json({
            error: `Refund amount ${refundAmount.toFixed(2)} exceeds threshold ${REFUND_APPROVAL_THRESHOLD}. Manager approval required.`,
            requires_approval: true,
            refund_amount: refundAmount,
            threshold: REFUND_APPROVAL_THRESHOLD,
          }, { status: 403 });
        }
      }

      const { data, error } = await supabase.rpc('refund_with_inventory', {
        p_order_id: order_id,
        p_order_item_id: order_item_id,
        p_quantity: quantity || 1,
        p_amount: refundAmount,
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

      // Log approved refund if above threshold
      if (refundAmount > REFUND_APPROVAL_THRESHOLD) {
        await fetch(`${s.url}/rest/v1/approval_requests`, {
          method: 'POST',
          headers: { ...s.headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            staff_id: auth.user?.id || null,
            action_type: 'refund',
            entity_type: 'order',
            entity_id: order_id,
            amount: refundAmount,
            reason: reason_text || reason || null,
            old_values: { order_id, order_item_id, quantity, amount, method, item_fate },
            new_values: { refund_amount: refundAmount, method, item_fate },
            status: 'approved',
          }),
        }).catch(() => {});
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
    if (totalRefunded + refundAmount > paidAmount) {
      return NextResponse.json({
        error: `Refund amount (${refundAmount}) exceeds remaining (${paidAmount - totalRefunded})`,
      }, { status: 400 });
    }

    // Check if approval is required
    if (refundAmount > REFUND_APPROVAL_THRESHOLD) {
      const { data: hasRefundApprove, error: approveErr } = await supabase.rpc('has_permission', {
        p_staff_id: auth.user!.id,
        p_permission: 'refund.approve',
      });

      if (approveErr || !hasRefundApprove) {
        const approvalRes = await fetch(`${s.url}/rest/v1/approval_requests`, {
          method: 'POST',
          headers: { ...s.headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            staff_id: auth.user.id,
            action_type: 'refund',
            entity_type: 'order',
            entity_id: order_id,
            amount: refundAmount,
            reason: reason_text || reason || null,
            old_values: { order_id, amount, method },
            new_values: { refund_amount: refundAmount, method },
            status: 'pending',
          }),
        });

        if (!approvalRes.ok) {
          const errText = await approvalRes.text();
          return NextResponse.json({ error: errText || 'Failed to create approval request' }, { status: 400 });
        }

        return NextResponse.json({
          error: `Refund amount ${refundAmount.toFixed(2)} exceeds threshold ${REFUND_APPROVAL_THRESHOLD}. Manager approval required.`,
          requires_approval: true,
          refund_amount: refundAmount,
          threshold: REFUND_APPROVAL_THRESHOLD,
        }, { status: 403 });
      }
    }

    const { data, error } = await supabase.rpc('complete_payment_atomic_v2', {
      p_order_id: order_id,
      p_payments: JSON.stringify([{
        amount: refundAmount,
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

    // Log approved refund if above threshold
    if (refundAmount > REFUND_APPROVAL_THRESHOLD) {
      await fetch(`${s.url}/rest/v1/approval_requests`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          staff_id: auth.user?.id || null,
          action_type: 'refund',
          entity_type: 'order',
          entity_id: order_id,
          amount: refundAmount,
          reason: reason_text || reason || null,
          old_values: { order_id, amount, method },
          new_values: { refund_amount: refundAmount, method },
          status: 'approved',
        }),
      }).catch(() => {});
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
