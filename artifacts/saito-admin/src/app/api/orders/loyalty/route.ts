import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * OS BUILD #1 — Customer + Loyalty spine.
 *
 * GET  /api/orders/loyalty?customer_id=...
 *      → { enabled, balance, min_redeem, point_value, points_per_manat }
 *
 * POST /api/orders/loyalty  { order_id, points }
 *      → loyalty_redeem RPC (idempotent per order; applies discount, v3 total)
 *
 * The spine: payment (frozen engine) sets status=paid → DB trigger
 * _trg_order_loyalty_spine auto-earns; refund → auto-reverses. Nothing here
 * touches the frozen payment path.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id') || '';

    const supabase = await createAuthClient();
    const { data: settings } = await supabase.from('settings').select('loyalty_enabled,loyalty_points_per_manat,loyalty_point_value,loyalty_min_redeem').eq('id', '1').maybeSingle();

    const enabled = Boolean(settings?.loyalty_enabled);
    const out: any = {
      enabled,
      balance: 0,
      min_redeem: settings?.loyalty_min_redeem ?? 10,
      point_value: settings?.loyalty_point_value ?? 0.01,
      points_per_manat: settings?.loyalty_points_per_manat ?? 1,
    };

    if (enabled && customerId) {
      const { data: acct } = await supabase
        .from('loyalty_accounts')
        .select('points_balance,total_earned,total_redeemed,is_active')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      out.balance = acct?.is_active === false ? 0 : (acct?.points_balance ?? 0);
      out.total_earned = acct?.total_earned ?? 0;
      out.total_redeemed = acct?.total_redeemed ?? 0;
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('loyalty.manage');
    if (!auth.authenticated) return auth as any;
    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { order_id, points } = body;
    if (!order_id || !Number.isInteger(points) || points <= 0) {
      return NextResponse.json({ error: 'order_id and positive integer points required' }, { status: 400 });
    }

    const supabase = await createAuthClient();
    const { data, error } = await supabase.rpc('loyalty_redeem', {
      p_order_id: order_id,
      p_points: points,
      p_performed_by: auth.user?.id || null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.success) return NextResponse.json(data, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
