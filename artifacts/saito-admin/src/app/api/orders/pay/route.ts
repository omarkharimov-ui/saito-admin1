import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
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
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;
    
    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    
    const rateLimitResult = paymentRateLimit(request);
    if (rateLimitResult) return rateLimitResult;
    
    const supabase = await createAuthClient();

    const { order_id, payment_method, cash_amount, card_amount, paid_amount, tip_amount, campaign_id, discount_amount, discount_type, per_item_allocations } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // Normalize the cash/card split regardless of what the frontend sent:
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
      p_cash_amount: cashPortion,
      p_card_amount: cardPortion,
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

    // ─── Cash drawer ledger ───
    if ((cashPortion > 0 || cardPortion > 0) && !data?.duplicate) {
      try {
        const s = svc();
        const { data: openSession } = await fetch(
          `${s.url}/rest/v1/cash_drawer_sessions?select=id&status=eq.open&order=opened_at.desc&limit=1`,
          { headers: s.headers }
        ).then(r => r.json()).then((rows: any) => ({ data: rows?.[0] || null })).catch(() => ({ data: null }));

        if (openSession?.id) {
          if (cashPortion > 0) {
            await fetch(`${s.url}/rest/v1/cash_drawer_log`, {
              method: 'POST',
              headers: s.headers,
              body: JSON.stringify({
                session_id: openSession.id,
                type: 'payment',
                amount: cashPortion,
                description: `Nağd ödəniş (order ${order_id})`,
                order_id,
                created_by: auth.user?.id || null,
              }),
            });
          }
          if (cardPortion > 0) {
            await fetch(`${s.url}/rest/v1/cash_drawer_log`, {
              method: 'POST',
              headers: s.headers,
              body: JSON.stringify({
                session_id: openSession.id,
                type: 'card_payment',
                amount: cardPortion,
                description: `${payment_method === 'voucher' ? 'Vouçer' : 'Kart'} ödəniş (order ${order_id})`,
                order_id,
                created_by: auth.user?.id || null,
              }),
            });
          }
        }
      } catch (drawerErr) {
        console.error('[pay] cash drawer log failed (non-fatal):', drawerErr);
      }
    }

    // ─── Store per-item payment allocations if provided ───
    if (per_item_allocations && Array.isArray(per_item_allocations) && per_item_allocations.length > 0 && !data?.duplicate) {
      try {
        const s = svc();
        const { data: openSession } = await fetch(
          `${s.url}/rest/v1/cash_drawer_sessions?select=id&status=eq.open&order=opened_at.desc&limit=1`,
          { headers: s.headers }
        ).then(r => r.json()).then((rows: any) => ({ data: rows?.[0] || null })).catch(() => ({ data: null }));

        const paymentRecords = per_item_allocations.map((alloc: any) => ({
          order_id,
          amount: Number(alloc.amount) || 0,
          payment_method: alloc.payment_method || 'card',
          method: alloc.payment_method || 'card',
          currency: 'AZN',
          status: 'completed',
          transaction_id: `POS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          split_group_id: openSession?.id || null,
          is_partial: true,
          created_by: auth.user?.id || null,
          performed_by: auth.user?.id || null,
        }));
        
        await fetch(`${s.url}/rest/v1/order_payments`, {
          method: 'POST',
          headers: s.headers,
          body: JSON.stringify(paymentRecords),
        });
      } catch (paymentErr) {
        console.error('[pay] per-item payment records failed (non-fatal):', paymentErr);
      }
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
