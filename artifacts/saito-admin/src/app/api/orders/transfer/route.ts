import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { from_table, to_table } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const s = svc();

    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/transfer_table_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_from_table: Number(from_table),
        p_to_table: Number(to_table),
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: null,
      }),
    });

    const rpcData = await rpcRes.json();
    if (!rpcRes.ok || !rpcData?.success) {
      const message = rpcData?.error || 'Transfer failed';
      console.error('[API /orders/transfer] RPC error:', message);
      return NextResponse.json({ error: message }, { status: rpcRes.ok ? 400 : rpcRes.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        from_table,
        to_table,
        order_id: rpcData.order_id,
      },
      undo: {
        from_table,
        to_table,
        orders: [{ id: rpcData.order_id }],
      },
    });
  } catch (error: any) {
    console.error('[API /orders/transfer] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { from_table, to_table, orders, table, targetTable } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const s = svc();
    const now = new Date().toISOString();

    for (const order of (orders || [])) {
      await fetch(`${s.url}/rest/v1/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        headers: { ...s.headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          table_number: from_table,
          total_amount: order.total_amount,
          guest_count: order.guest_count,
          status: order.status,
          merged_into: order.merged_into,
          version: (order.version || 0) + 1,
          updated_at: now,
        }),
      });
    }

    const tt = targetTable || {};
    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${to_table}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: tt.status ?? 'empty',
        guest_count: tt.guest_count ?? null,
        total_amount: tt.total_amount ?? 0,
        merged_into_table: tt.merged_into_table ?? null,
        reservation_id: tt.reservation_id ?? null,
        reservation_name: tt.reservation_name ?? null,
        reservation_phone: tt.reservation_phone ?? null,
        reservation_time: tt.reservation_time ?? null,
        updated_at: now,
      }),
    });

    const t = table || {};
    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${from_table}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: t.status ?? 'occupied',
        guest_count: t.guest_count ?? null,
        total_amount: t.total_amount ?? 0,
        merged_into_table: t.merged_into_table ?? null,
        reservation_id: t.reservation_id ?? null,
        reservation_name: t.reservation_name ?? null,
        reservation_phone: t.reservation_phone ?? null,
        reservation_time: t.reservation_time ?? null,
        updated_at: now,
      }),
    });

    return NextResponse.json({ success: true, message: 'Transfer geri alındı' });
  } catch (error: any) {
    console.error('[API /orders/transfer] Undo error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

