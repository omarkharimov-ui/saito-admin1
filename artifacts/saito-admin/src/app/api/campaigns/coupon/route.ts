import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// Quick-fix 4 — coupon validation endpoint.
// POST { code, items: [{ product_id, unit_price, quantity }],
//        order_amount, dining_type?, table_number? }
// → 200 { ok: true, campaign_id, name, type, discount_amount, message }
//   400 { ok: false, error: 'CODE_REQUIRED' | 'EMPTY_CART' | ... }
//
// Server-side only: the discount is computed by validate_coupon (existing
// calculate_cart_campaign_discount engine) — the client can never propose
// its own discount amount. The result is applied as an ORDER-LEVEL
// discount_type='coupon' (orders route subtracts it exactly once, deduped
// per campaign_id on appends).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth as any;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'BAD_BODY' }, { status: 400 });
    }

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const items = Array.isArray(body.items)
      ? body.items
          .filter((i: any) => i && (i.unit_price != null) && (i.quantity != null))
          .slice(0, 100)
          .map((i: any) => ({
            product_id: typeof i.product_id === 'string' ? i.product_id : null,
            unit_price: Number(i.unit_price) || 0,
            quantity: Math.max(1, Math.min(999, parseInt(i.quantity, 10) || 1)),
          }))
      : [];
    const orderAmount = Number(body.order_amount) || 0;
    const diningType = ['dine_in', 'takeaway', 'delivery'].includes(body.dining_type)
      ? body.dining_type : 'dine_in';
    const tableNumber = body.table_number != null
      ? (parseInt(body.table_number, 10) || null)
      : null;

    if (!code) {
      return NextResponse.json({ ok: false, error: 'CODE_REQUIRED' }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: 'EMPTY_CART' }, { status: 400 });
    }

    const supabase = await createAuthClient();
    const { data, error } = await supabase.rpc('validate_coupon', {
      p_code: code,
      p_cart_items: JSON.stringify(items),
      p_order_amount: orderAmount,
      p_table_number: tableNumber,
      p_dining_type: diningType,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: 'RPC_ERROR', detail: error.message }, { status: 500 });
    }
    const res = data as any;
    if (!res?.ok) {
      const status = res?.error === 'COUPON_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ ok: false, error: res?.error || 'NOT_APPLICABLE' }, { status });
    }

    return NextResponse.json({
      ok: true,
      campaign_id: res.campaign_id,
      name: res.name,
      type: res.type,
      discount_amount: Number(res.discount_amount) || 0,
      message: res.message || '',
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: 'INTERNAL', detail: err?.message }, { status: 500 });
  }
}
