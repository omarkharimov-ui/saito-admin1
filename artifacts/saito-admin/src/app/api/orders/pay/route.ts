import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { paymentRateLimit } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { resolveWriteLocationContext } from '@/lib/location-context';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('payments.create');
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const rateLimitResult = paymentRateLimit(request);
    if (rateLimitResult) return rateLimitResult;

    const supabase = await createAuthClient();

    const { order_id, payment_method, cash_amount, card_amount, paid_amount, tip_amount, campaign_id, discount_amount, discount_type, per_item_allocations, cash_received, idempotency_key, card_reference } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // P-4 C-1 (ratified D-1): the payment boundary REFUSES keyless financial
    // mutations. The key is a client retry token; the DB enforces scope
    // (namespace,key) + order/amount binding. Keyless direct RPC is a
    // service-role-internal path only — it must not be reachable from the app.
    if (typeof idempotency_key !== 'string' || idempotency_key.trim().length === 0) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
    }
    if (idempotency_key.length > 128) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_INVALID' }, { status: 400 });
    }

    // P-1 M2 (D-5): server-side location binding. The operator's allowed write
    // location is resolved from the SESSION (never client-supplied) and must match
    // the order's location before any financial mutation. The DB re-asserts both
    // (complete_payment_atomic_v2: order location == p_location_id AND actor
    // allowed at that location) — fail closed.
    const { data: ordRow } = await supabase
      .from('orders')
      .select('location_id')
      .eq('id', order_id)
      .maybeSingle();
    const operatorLocation = await resolveWriteLocationContext(auth.user!.id);
    if (!operatorLocation?.locationId || !ordRow?.location_id) {
      return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    }
    if (ordRow.location_id !== operatorLocation.locationId) {
      return NextResponse.json({ error: 'LOCATION_MISMATCH' }, { status: 403 });
    }

    const requestedTotal = Number(paid_amount) || 0;

    // 2026-09-23 (owner, production-readiness): a fully-paid order (paid_amount
    // already >= total) must never be re-paid. The DB overpay guard used to leak
    // a raw "PAYMENT_EXCEEDS_REMAINING: payment 13 > remaining 0.00" toast. We
    // catch it here with a clean, mappable code BEFORE the RPC.
    try {
      const { data: payCheck } = await supabase
        .from('orders')
        .select('paid_amount,total_amount,status')
        .eq('id', order_id)
        .maybeSingle();
      if (payCheck && requestedTotal > 0 && Number(payCheck.paid_amount || 0) >= Number(payCheck.total_amount || 0) && Number(payCheck.total_amount || 0) > 0) {
        return NextResponse.json({ error: 'ORDER_ALREADY_PAID', already_paid: true }, { status: 409 });
      }
    } catch (_e) { /* non-fatal: fall through to RPC guards */ }

    let cashPortion = Number(cash_amount) || 0;
    let cardPortion = Number(card_amount) || 0;

    if (payment_method === 'cash') {
      cashPortion = requestedTotal;
      cardPortion = 0;
    } else if (payment_method === 'card' || payment_method === 'qr' || payment_method === 'transfer' || payment_method === 'corporate' || payment_method === 'online' || payment_method === 'voucher' || payment_method === 'gift_card' || payment_method === 'room_charge') {
      // FIX (2026-09-21): 'gift_card' and 'room_charge' were MISSING from this
      // branch — the GiftCardModal/RoomChargeModal redeemed the card first,
      // then /api/orders/pay built paymentsPayload=[] (both portions 0) and
      // complete_payment_atomic_v2 got an EMPTY payments array → the order was
      // never paid while the card balance was already deducted (live evidence:
      // payments.payment_method only ever contained cash/corporate). Now the
      // full amount is recorded under its own method — the financial ledger
      // keeps gift-card money separate from bank-card money.
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

    // Get open cash drawer session for SSOT logging. 11r: scoped to the
    // operator's location — the old lookup grabbed ANY open session in the
    // org (multi-location deployments would have bound cash to the wrong drawer).
    let cashDrawerSessionId: string | null = null;
    if ((cashPortion > 0 || cardPortion > 0)) {
      try {
        const s = svc();
        // 11r (E2E catch, round 3 — LATENT BUG since this feature was born):
        // the original code did `const { data: openSession } = await fetch(...)`
        // — destructuring `data` out of a PostgREST ROW object ({id}), which is
        // always undefined. The session binding silently NEVER worked (null was
        // "non-fatal"), and the new hard gate exposed it. Await the full JSON
        // (array of rows) and take rows[0]. No destructuring.
        const rows: any = await fetch(
          `${s.url}/rest/v1/cash_drawer_sessions?select=id&status=eq.open&location_id=eq.${encodeURIComponent(operatorLocation.locationId)}&order=opened_at.desc&limit=1`,
          { headers: s.headers }
        ).then(r => r.json()).catch((e) => { console.error('[pay] cash drawer session lookup failed (fail-closed for cash):', e); return null; });
        const openSession = Array.isArray(rows) ? (rows[0] || null) : null;
        if (openSession?.id) cashDrawerSessionId = openSession.id;
      } catch (e) {
        console.error('[pay] cash drawer session lookup failed (fail-closed for cash):', e);
      }
    }

    // 11r (owner, Variant A — "nağd ödəniş üçün şift məcburi"): every CASH
    // receipt must bind to an open drawer session, or the day-close report
    // cannot attribute the money (the exact hole: "bu pulu kim, hansı
    // növbədə alıb?"). Cash = the whole payment OR any cash portion of a
    // split (per-item allocations included). Card/QR/transfer/corporate/
    // gift-card never touch the drawer → never gated. Order CREATION stays
    // ungated — sales never stop; only the physical cash receipt is gated.
    // The client catches CASH_DRAWER_REQUIRED, shows the one-tap "KASSANI AÇ"
    // modal, and auto-retries with the same idempotency key after the drawer
    // opens (server re-validates; the key makes the retry idempotent).
    const hasCashPortion = cashPortion > 0
      || (Array.isArray(per_item_allocations) && per_item_allocations.some((a: any) => a?.payment_method === 'cash' && (Number(a.amount) || 0) > 0));
    if (hasCashPortion && !cashDrawerSessionId) {
      return NextResponse.json({ error: 'CASH_DRAWER_REQUIRED', cash_drawer_required: true }, { status: 403 });
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
      p_location_id: operatorLocation.locationId,
    });

    if (error) {
      console.error('[pay] RPC failed:', error);
      if (error.message === 'ORDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      // 2026-09-23: overpay guards map to the SAME clean code (race fallback) so
      // the UI never shows a raw DB message.
      if (error.message === 'ORDER_ALREADY_PAID'
        || error.message.startsWith('PAYMENT_EXCEEDS_REMAINING')
        || error.message.startsWith('PARTIAL_PAID_CANNOT_ADD')) {
        return NextResponse.json({ error: 'ORDER_ALREADY_PAID', already_paid: true }, { status: 409 });
      }
      // P-4 C-3 (ratified D-3): same key bound to a different order/amount → 409.
      if (error.message.startsWith('IDEMPOTENCY_CONFLICT')) {
        return NextResponse.json({ error: error.message, idempotent_conflict: true }, { status: 409 });
      }
      if (error.message.includes('LOCATION_MISMATCH') || error.message.includes('LOCATION_ACCESS_DENIED')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'LOCATION_CONTEXT_MISSING' || error.message === 'ORDER_LOCATION_NULL') {
        return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // P-4 C-6 (ratified D-6): best-effort prune of expired key metadata
    // (30-day retention). Advisory-locked + idempotent; failure NEVER blocks
    // a payment. The financial ledger is untouched by the pruner.
    try {
      await supabase.rpc('prune_expired_idempotency_keys');
    } catch (pruneErr) {
      console.warn('[pay] prune_expired_idempotency_keys (non-blocking):', pruneErr);
    }

    // 2026-09-26 (owner, Q7): card terminal authorization code (today:
    // simulator SIM-XXXXXX; later: PSP auth code) → order_payments.reference.
    // Best-effort; a reference-write failure NEVER voids the payment.
    if (card_reference && Array.isArray(data.payment_ids) && data.payment_ids.length > 0) {
      try {
        await supabase
          .from('order_payments')
          .update({ reference: String(card_reference).slice(0, 120) })
          .in('id', data.payment_ids)
          .eq('is_refund', false);
      } catch (refErr) {
        console.warn('[pay] card_reference write (non-blocking):', refErr);
      }
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
      // P-4 C-5 (ratified D-5): replay carries BOTH layers — `original` (what
      // the request did when it first succeeded) and `current` (live order
      // state, re-read under the lock). A replay of a since-refunded order is
      // visible as such — the stored snapshot never masquerades as current truth.
      idempotent: data.idempotent || false,
      duplicate: data.duplicate || false,
      replay: data.current ? {
        current: data.current,
        original_status: data.original?.status ?? null,
        original_paid_amount: data.original?.paid_amount ?? null,
      } : null,
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
