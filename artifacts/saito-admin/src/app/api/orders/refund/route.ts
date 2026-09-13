import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { resolveWriteLocationContext } from '@/lib/location-context';

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
      idempotency_key,
    } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    // P-4 C-1/C-4 (ratified D-1/D-4): refunds are financial mutations and the
    // route REFUSES keyless ones. Two refund clicks (memoized key) → exactly
    // one refund row; the net-paid cap stays as a second layer, not the
    // idempotency mechanism. Namespace 'refund' is derived server-side.
    if (typeof idempotency_key !== 'string' || idempotency_key.trim().length === 0) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
    }
    if (idempotency_key.length > 128) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_INVALID' }, { status: 400 });
    }

    const refundAmount = Number(amount) || 0;

    // P-1 M2 (D-5): server-side location binding for the refund write path.
    const { data: ordLoc } = await supabase
      .from('orders')
      .select('location_id')
      .eq('id', order_id)
      .maybeSingle();
    const opLoc = await resolveWriteLocationContext(auth.user!.id);
    if (!opLoc?.locationId || !ordLoc?.location_id) {
      return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    }
    if (ordLoc.location_id !== opLoc.locationId) {
      return NextResponse.json({ error: 'LOCATION_MISMATCH' }, { status: 403 });
    }

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
        p_location_id: opLoc.locationId,
        // P-4 C-4 (ratified D-4): refund idempotency — namespace 'refund'.
        p_idempotency_key: idempotency_key,
      });

      if (error) {
        console.error('[refund] refund_with_inventory RPC failed:', error);
        // P-4 C-3 (ratified D-3): same key bound to a different order/amount → 409.
        if (String(error.message || '').startsWith('IDEMPOTENCY_CONFLICT')) {
          return NextResponse.json({ error: error.message, idempotent_conflict: true }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (data && !data.success) {
        if (String(data.error || '').startsWith('IDEMPOTENCY_CONFLICT')) {
          return NextResponse.json(data, { status: 409 });
        }
        const st = /LOCATION_MISMATCH|LOCATION_ACCESS_DENIED/.test(data.error || '') ? 403 : 400;
        return NextResponse.json(data, { status: st });
      }

      // Loyalty spine (OS BUILD #1b): reverse the refunded item's points.
      // Best-effort — a loyalty failure must never break the refund.
      try {
        await supabase.rpc('loyalty_reverse', {
          p_order_id: order_id,
          p_order_item_id: order_item_id || null,
          p_reason: 'refund',
          p_performed_by: auth.user?.id || null,
        });
      } catch (loyErr) {
        console.warn('[refund] loyalty_reverse (non-blocking):', loyErr);
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

    // P-4 (D-3/D-5): REPLAY DETECTION. If this key is already bound to THIS
    // order, the request is a duplicate/refused-mismatch — the DB
    // (complete_payment_atomic_v2 dedupe, which runs BEFORE its refund-cap
    // guard) is the authority and will return the stored result or
    // IDEMPOTENCY_CONFLICT. The route pre-guards below would otherwise
    // misfire on a replay: they re-count the ALREADY-APPLIED refund against
    // current state (status 'refunded' / cap exceeded) and 400 instead of
    // replaying. So on a detected replay we skip the pre-guards and let the
    // DB decide. A different amount under the same key → DB 409 (D-3).
    // RLS note (verified live 2026-09-13): payment_idempotency_keys has RLS OFF
    // and a SELECT grant; this route's client is createAuthClient() =
    // service_role, so the read works with the server path unchanged.
    const { data: priorRefund } = await supabase
      .from('payment_idempotency_keys')
      .select('namespace, order_id, amount')
      .eq('key', idempotency_key)
      .eq('namespace', 'refund')
      .maybeSingle();
    // Any prior refund use of this key => a replay/mismatch attempt; the DB is
    // the authority (replay if same order, IDEMPOTENCY_CONFLICT if different).
    const isReplayAttempt = !!priorRefund;
    if (isReplayAttempt) {
      // fall through straight to the RPC (line below) — do NOT run the guards.
    } else {
      // P-4 (D-4): order-level refund may apply to partially-refunded orders
      // too (the DB net-paid cap is the authority). The old `!== 'paid'` guard
      // blocked legitimate sequential partial refunds at the route level.
      if (order.status !== 'paid' && order.status !== 'partially_refunded') {
        return NextResponse.json({ error: 'Can only refund paid orders. Current: ' + order.status }, { status: 400 });
      }
      const totalRefunded = Number(order.refund_amount) || 0;
      const paidAmount = Number(order.paid_amount) || 0;
      if (totalRefunded + refundAmount > paidAmount) {
        return NextResponse.json({
          error: `Refund amount (${refundAmount}) exceeds remaining (${paidAmount - totalRefunded})`,
        }, { status: 400 });
      }
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

    // P-1 M2b: p_payments must be a jsonb ARRAY (was stringified — refunds had
    // never succeeded in prod because of it).
    const { data, error } = await supabase.rpc('complete_payment_atomic_v2', {
      p_order_id: order_id,
      p_payments: [{
        amount: refundAmount,
        method: method || 'cash',
        is_refund: true,
      }],
      p_payment_method: method || 'cash',
      p_performed_by: auth.user?.id || null,
      p_location_id: opLoc.locationId,
      // P-4 C-4 (ratified D-4): refund idempotency — namespace derived
      // server-side as 'refund' (v_refund_total>0), key bound to order+amount.
      p_idempotency_key: idempotency_key,
    });

    if (error) {
      console.error('[refund] RPC failed:', error);
      // P-4 C-3 (ratified D-3): same key bound to a different order/amount → 409.
      if (String(error.message || '').startsWith('IDEMPOTENCY_CONFLICT')) {
        return NextResponse.json({ error: error.message, idempotent_conflict: true }, { status: 409 });
      }
      if (error.message === 'ORDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (error.message === 'ORDER_ALREADY_PAID') {
        return NextResponse.json({ error: 'Order is already paid' }, { status: 409 });
      }
      if (error.message.includes('LOCATION_MISMATCH') || error.message.includes('LOCATION_ACCESS_DENIED')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'LOCATION_CONTEXT_MISSING' || error.message === 'ORDER_LOCATION_NULL') {
        return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data && !data.success) {
      return NextResponse.json(data, { status: 400 });
    }

    // Loyalty spine (OS BUILD #1b): order-level refund → reverse ALL points.
    // Best-effort — a loyalty failure must never break the refund.
    try {
      await supabase.rpc('loyalty_reverse', {
        p_order_id: order_id,
        p_order_item_id: null,
        p_reason: 'refund',
        p_performed_by: auth.user?.id || null,
      });
    } catch (loyErr) {
      console.warn('[refund] loyalty_reverse (non-blocking):', loyErr);
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
