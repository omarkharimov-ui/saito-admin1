import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('payments.refund', ['cashier', 'admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(request, auth.authenticated)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  const supabase = await createAuthClient();
  const { order_id, amount, method, reason } = await request.json();
  if (!order_id || !amount) {
    return NextResponse.json({ error: 'order_id and amount are required' }, { status: 400 });
  }

  // PAID check — can only refund paid orders
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, paid_amount, refund_amount')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'Can only refund paid orders. Current status: ' + order.status }, { status: 400 });
  }

  // Refund amount check — cannot refund more than paid
  const totalRefunded = Number(order.refund_amount) || 0;
  const paidAmount = Number(order.paid_amount) || 0;
  if (totalRefunded + Number(amount) > paidAmount) {
    return NextResponse.json({
      error: `Refund amount (${amount}) exceeds remaining refundable amount (${paidAmount - totalRefunded})`,
    }, { status: 400 });
  }

  let sessionId: string | null = null;
  try {
    const s = svc();
    const sessionRes = await fetch(
      `${s.url}/rest/v1/cash_drawer_sessions?select=id&status=eq.open&order=opened_at.desc&limit=1`,
      { headers: s.headers }
    );
    if (sessionRes.ok) {
      const rows = await sessionRes.json();
      if (rows?.[0]?.id) sessionId = rows[0].id;
    }
  } catch (e) {
    console.error('[refund] cash session lookup failed (non-fatal):', e);
  }

  const { data, error } = await supabase.rpc('complete_payment_atomic_v2', {
    p_order_id: order_id,
    p_payments: JSON.stringify([{
      amount: Number(amount),
      method: method || 'cash',
      is_refund: true,
      reason_text: reason || 'Müştəri şikayəti',
    }]),
    p_payment_method: method || 'cash',
    p_performed_by: auth.user?.id || null,
    p_performed_by_terminal_id: null,
    p_cash_drawer_session_id: sessionId,
  });

  if (error) {
    console.error('[refund] RPC failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data && !data.success) {
    return NextResponse.json(data, { status: 400 });
  }

  return NextResponse.json(data);
}
