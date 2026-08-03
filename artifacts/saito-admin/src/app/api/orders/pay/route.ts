import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { paymentRateLimit } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { requireActiveShift } from '@/lib/shiftLock';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;
    
    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    
    const rateLimitResult = paymentRateLimit(request);
    if (rateLimitResult) return rateLimitResult;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }
    
    const supabase = await createAuthClient();

    // Idempotency: check if this idempotency key was already processed
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      const existingRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/payment_idempotency_keys?key=eq.${idempotencyKey}&select=*`, {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
        },
      });
      const existingData = await existingRes.json();
      if (Array.isArray(existingData) && existingData.length > 0) {
        const existing = existingData[0];
        if (existing.status === 'completed') {
          return NextResponse.json({
            success: true,
            paid_amount: existing.amount,
            message: 'Payment already processed (idempotent)',
          });
        }
      }
    }

    const { order_id, payment_method, cash_amount, card_amount, tip_amount, campaign_id, discount_amount, discount_type, paid_amount } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const paidAmount = paid_amount !== undefined && paid_amount !== null
      ? paid_amount
      : (cash_amount || 0) + (card_amount || 0);

    // ─── Auto-apply active campaign if no campaign_id provided ───
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
        // Fetch campaign name for display
        const { data: camp } = await supabase.from('campaigns').select('title').eq('id', effectiveCampaignId).maybeSingle();
        autoCampaignName = camp?.title || null;
      }
    }

    // Record idempotency key BEFORE RPC to prevent double-charge on network failure
    if (idempotencyKey) {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/payment_idempotency_keys`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          key: idempotencyKey,
          order_id: order_id,
          amount: paidAmount,
          status: 'processing',
        }),
      }).catch(() => {});
    }

    // ─── Atomic payment via RPC ───
    // Handles: order mark paid, child orders paid, inventory deduction,
    // campaign usage, reservation complete, kitchen complete, table release,
    // audit log, persistent notification.
    const { data, error } = await supabase.rpc('process_order_payment', {
      p_order_id: order_id,
      p_payment_method: payment_method || 'card',
      p_paid_amount: paidAmount,
      p_tip_amount: tip_amount || 0,
      p_campaign_id: effectiveCampaignId,
      p_discount_amount: effectiveDiscountAmount,
      p_discount_type: effectiveDiscountType,
      p_performed_by: auth.user?.id || null,
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

    // Record idempotency key
    if (idempotencyKey) {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/payment_idempotency_keys`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          key: idempotencyKey,
          order_id: order_id,
          amount: paidAmount,
          status: 'completed',
        }),
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      paid_amount: data.paid_amount,
      tip_amount: data.tip_amount,
      cogs: data.cogs,
      profit: data.profit,
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
