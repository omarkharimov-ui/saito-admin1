import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// 13d-A2: service-role bridge for the `cancel_table_orders` RPC (the
// orders-page "clear table" action — distinct from /orders/clear-table,
// which is the manager-PIN floor op using clear_table_atomic).
// ROOT CAUSE (audit 13d-A RPC layer): EXECUTE is granted ONLY to
// postgres/service_role/test_rls_role — the browser's anon call got 401
// (visible error, table never released).
// NOTE: the DB has TWO overloads; all args are named (p_table_number alone
// is ambiguous — PGRST203), per the original client comment.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('pos.use');
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { table_number, reason } = body;
    if (!table_number) {
      return NextResponse.json({ error: 'table_number is required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    const rpcRes = await fetch(`${url}/rest/v1/rpc/cancel_table_orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_table_number: Number(table_number),
        p_reason: String(reason || 'cleared_from_orders'),
        p_performed_by: auth.user?.id || null,
      }),
    });
    const data = await rpcRes.json().catch(() => ({}));
    if (!rpcRes.ok) {
      return NextResponse.json(
        { error: data?.error || data?.message || `RPC failed (${rpcRes.status})` },
        { status: rpcRes.status >= 500 ? 500 : rpcRes.status }
      );
    }
    return NextResponse.json({ success: true, ...(typeof data === 'object' && data ? data : {}) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
