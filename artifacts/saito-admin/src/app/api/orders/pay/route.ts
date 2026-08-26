import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { paymentRateLimit } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('payments.create', ['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const rateLimitResult = paymentRateLimit(request);
    if (rateLimitResult) return rateLimitResult;

    const supabase = await createAuthClient();

    const { order_id, payment_method, cash_amount, card_amount, paid_amount, tip_amount, campaign_id, discount_amount, discount_type, per_item_allocations, cash_received, idempotency_key } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const requestedTotal = Number(paid_amount) || 0;
    let cashPortion = Number(cash_amount) || 0;
    let cardPortion = Number(card_amount) || 0;

    if (payment_method === 'cash') {
      cashPortion = requestedTotal;
      cardPortion = 0;
    } else if (payment_method === 'card' || payment_method === 'qr' || payment_method === 'transfer' || payment_method === 'corporate' || payment_method === 'online' || payment_method === 'voucher') {
      cashPortion = 0;
      cardPortion = requestedTotal;
    } else if (payment_method === 'split') {
      if (cashPortion === 0 && cardPortion === 0) {
        cashPortion = requestedTotal / 2;
        cardPortion = requestedTotal / 2;
      }
    } else if (payment_method === 'pay_later') {
      cashPortion = 0;
      cardPortion = 0;
    }

    const paidAmount = Math.round((cashPortion + cardPortion) * 100) / 100;

    let effectiveCampaignId = campaign_id || null;
    let effectiveDiscountAmount = discount_amount || 0;
    let effectiveDiscountType = discount_type || null;
    let autoCampaignName: string | null = null;

    if (!effectiveCampaignId) {
      const { data: campaignResult } = await supabase.rpc('auto_apply_campaigns', {
        p_order_id: order_id,
      });
      if (campaignResult?.applied) {
        effectiveCampaignId = campaignResult.campaign_id;
        effectiveDiscountAmount = campaignResult.discount_amount;
        effectiveDiscountType = campaignResult.discount_type;
        const { data: camp } = await supabase.from('campaigns').select('title').eq('id', effectiveCampaignId).maybeSingle();
        autoCampaignName = camp?.title || null;
      }
    }

    // Get open cash drawer session for SSOT logging
    let cashDrawerSessionId: string | null = null;
    if ((cashPortion > 0 || cardPortion > 0)) {
      try {
        const s = svc();
        const { data: openSession } = await fetch(
          `${s.url}/rest/v1/cash_drawer_sessions?select=id&status=eq.open&order=opened_at.desc&limit=1`,
          { headers: s.headers }
        ).then(r => r.json()).then((rows: any) => rows?.[0] || null).catch(() => null);
        if (openSession?.id) cashDrawerSessionId = openSession.id;
      } catch (e) {
        console.error('[pay] cash drawer session lookup failed (non-fatal):', e);
      }
    }

    const paymentsPayload = (per_item_allocations && Array.isArray(per_item_allocations) && per_item_allocations.length > 0)
      ? per_item_allocations.map((alloc: any) => ({
          method: alloc.payment_method || 'card',
          amount: Number(alloc.amount) || 0,
          is_partial: true,
          split_group_id: cashDrawerSessionId,
        }))
      : [
          { method: 'cash', amount: cashPortion },
          { method: payment_method === 'split' ? 'split' : payment_method, amount: cardPortion },
        ].filter(p => p.amount > 0);

    const { data, error } = await supabase.rpc('complete_payment_atomic_v2', {
      p_order_id: order_id,
      p_payments: paymentsPayload,
      p_payment_method: payment_method || 'card',
      p_cash_amount: cashPortion,
      p_card_amount: cardPortion,
      p_tip_amount: tip_amount || 0,
      p_discount_amount: effectiveDiscountAmount,
      p_discount_type: effectiveDiscountType,
      p_performed_by: auth.user?.id || null,
      p_performed_by_terminal_id: null,
      p_cash_drawer_session_id: cashDrawerSessionId,
      p_cash_received: cash_received || null,
      p_idempotency_key: idempotency_key || null,
    });

    if (error) {
      console.error('[pay] RPC failed:', error);
      if (error.message === 'ORDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (error.message === 'ORDER_ALREADY_PAID') {
        return NextResponse.json({ error: 'Order is already paid' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      paid_amount: data.paid_amount,
      total_amount: data.total_amount,
      remaining: data.remaining,
      is_fully_paid: data.is_fully_paid,
      status: data.status,
      tip_amount: data.tip_amount,
      cash_received: data.cash_received,
      change: data.change,
      payment_ids: data.payment_ids,
      idempotent: data.idempotent || false,
      table_number: data.table_number,
      campaign: autoCampaignName ? {
        id: effectiveCampaignId,
        name: autoCampaignName,
        discount: effectiveDiscountAmount,
        type: effectiveDiscountType,
      } : null,
    });
  } catch (error: any) {
    console.error('[API /orders/pay] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
