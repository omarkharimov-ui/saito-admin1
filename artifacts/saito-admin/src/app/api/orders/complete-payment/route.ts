import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/** @deprecated Use POST /api/orders/pay instead. Kept for backward compatibility. */
export async function POST(request: Request) {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const body = await request.json();
    const { order_id, payments, payment_method, cash_amount, card_amount, tip_amount, discount_amount, discount_type, performed_by, terminal_id, cash_drawer_session_id } = body;

    if (!order_id || !payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: 'order_id and payments array are required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/rpc/complete_payment_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_order_id: order_id,
        p_payments: payments,
        p_payment_method: payment_method || 'cash',
        p_cash_amount: cash_amount || 0,
        p_card_amount: card_amount || 0,
        p_tip_amount: tip_amount || 0,
        p_discount_amount: discount_amount || 0,
        p_discount_type: discount_type || null,
        p_performed_by: performed_by || null,
        p_performed_by_terminal_id: terminal_id || null,
        p_cash_drawer_session_id: cash_drawer_session_id || null,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Payment failed: ${errText}`, status: res.status }, { status: 400 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
