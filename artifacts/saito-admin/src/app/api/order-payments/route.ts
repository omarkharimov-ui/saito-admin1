import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: Request) {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const body = await request.json();
    const { order_id, method, amount, currency, transaction_id, split_group_id, is_partial, is_refund, reference_order_id, created_by } = body;

    if (!order_id || !method || !amount) {
      return NextResponse.json({ error: 'order_id, method, amount are required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/order_payments`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        order_id,
        method,
        amount,
        currency: currency || 'AZN',
        transaction_id: transaction_id || null,
        split_group_id: split_group_id || null,
        is_partial: !!is_partial,
        is_refund: !!is_refund,
        reference_order_id: reference_order_id || null,
        created_by: created_by || null,
        created_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Payment insert failed: ${errText}` }, { status: 400 });
    }

    const created = await res.json();
    return NextResponse.json({ success: true, payment: Array.isArray(created) ? created[0] : created });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
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
