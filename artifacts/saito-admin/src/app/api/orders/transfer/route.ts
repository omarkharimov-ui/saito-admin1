import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    // F-01 (frozen): transfer is a manager-level floor op (`floor.manage`).
    // F-02 (frozen): p_token = session identity; the RPC enforces permission + location.
    const auth = await requirePermission('floor.manage');
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
        p_token: auth.token,
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
      const status = rpcData?.error === 'PERMISSION_DENIED' || rpcData?.error === 'FORBIDDEN_LOCATION' ? 403
        : rpcData?.error === 'FORBIDDEN' ? 401 : rpcRes.ok ? 400 : rpcRes.status;
      return NextResponse.json({ error: message }, { status });
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
    // F-01 + F-10 (frozen): transfer-undo = the INVERSE atomic transfer (to→from).
    // No raw client PATCH rewrite of table_floors/orders (bypassed state machine,
    // FOR UPDATE locks, audit and outbox). The RPC enforces floor.manage,
    // session-location scope, concurrency, audit + outbox.
    const auth = await requirePermission('floor.manage');
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
        p_token: auth.token,
        p_from_table: Number(to_table),
        p_to_table: Number(from_table),
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: null,
      }),
    });
    const rpcData = await rpcRes.json().catch(() => ({}));
    if (!rpcRes.ok || rpcData?.success === false) {
      const message = rpcData?.error || 'Transfer undo failed';
      const status = rpcData?.error === 'PERMISSION_DENIED' || rpcData?.error === 'FORBIDDEN_LOCATION' ? 403
        : rpcData?.error === 'FORBIDDEN' ? 401 : rpcRes.ok ? 400 : rpcRes.status;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({
      success: true,
      action: 'transfer-undo',
      order_id: rpcData.order_id,
      undo: { from_table, to_table },
    });
  } catch (error: any) {
    console.error('[API /orders/transfer DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
