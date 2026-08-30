import { NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: Request) {
  const auth = await requirePermission('payments.create');
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const body = await request.json();
    const { order_id, method, amount, currency, transaction_id, split_group_id, is_partial, is_refund, created_by } = body;

    if (!order_id || !method || !amount) {
      return NextResponse.json({ error: 'order_id, method, amount are required' }, { status: 400 });
    }

    // Route through the atomic RPC (SSOT). Never insert order_payments directly —
    // that bypasses order-state sync, stock deduction, table/audit reconciliation.
    const amt = Number(amount) || 0;
    const { data, error } = await supabase.rpc('complete_payment_atomic', {
      p_order_id: order_id,
      p_payments: [{
        method,
        amount: amt,
        currency: currency || 'AZN',
        transaction_id: transaction_id || null,
        split_group_id: split_group_id || null,
        is_partial: !!is_partial,
        is_refund: !!is_refund,
      }],
      p_payment_method: method,
      p_cash_amount: method === 'cash' || method === 'nağd' ? amt : 0,
      p_card_amount: method === 'cash' || method === 'nağd' ? 0 : amt,
      p_tip_amount: 0,
      p_discount_amount: 0,
      p_discount_type: null,
      p_performed_by: created_by || null,
      p_performed_by_terminal_id: null,
      p_cash_drawer_session_id: split_group_id || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: created } = await supabase
      .from('order_payments')
      .select('*')
      .eq('order_id', order_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ success: true, payment: created || data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');
    const splitGroupId = searchParams.get('split_group_id');

    if (!orderId && !splitGroupId) {
      return NextResponse.json({ error: 'order_id or split_group_id required' }, { status: 400 });
    }

    const filters: string[] = [];
    if (orderId) filters.push(`order_id=eq.${orderId}`);
    if (splitGroupId) filters.push(`split_group_id=eq.${splitGroupId}`);

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/order_payments?${filters.join('&')}&order=created_at.asc`, { headers: s.headers });
    const data = await res.json();

    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
