import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { order_id, payment_method, cash_amount, card_amount, tip_amount, campaign_id, discount_amount, discount_type } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const paidAmount = (cash_amount || 0) + (card_amount || 0);

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

    // ─── Tip tracking (separate from RPC for flexibility) ───
    if (tip_amount && Number(tip_amount) > 0) {
      await supabase.from('orders').update({ tip_amount }).eq('id', order_id);
    }

    return NextResponse.json({
      success: true,
      paid_amount: data.paid_amount,
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
