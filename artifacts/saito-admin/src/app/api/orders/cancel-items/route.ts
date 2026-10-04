import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// 13d-A2: service-role bridge for the `cancel_order_items` RPC.
// ROOT CAUSE (audit 13d-A RPC layer): the function is SECURITY DEFINER but
// EXECUTE is granted ONLY to postgres/service_role/test_rls_role — the
// browser's anon client gets HTTP 401. The two OrderModal call sites
// (draft-confirm deletes + partial-cancel full lines) awaited the rpc
// WITHOUT checking `.error` → supabase-js resolves (does not throw) →
// the cancel was SILENTLY LOST while the audit row was still written and
// a success toast shown. Service-role invocation restores the intended
// FOR UPDATE delete + stock reversal + total recompute.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('pos.use');
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { order_id, items } = body;
    if (!order_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'order_id and items[] are required' }, { status: 400 });
    }
    for (const it of items) {
      if (!it?.order_item_id) return NextResponse.json({ error: 'each item needs order_item_id' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    const rpcRes = await fetch(`${url}/rest/v1/rpc/cancel_order_items`, {
      method: 'POST',
      headers,
      // p_items is JSONB: PostgREST maps the JSON body value 1:1 into jsonb,
      // so send a REAL JSON array. A stringified array becomes a jsonb STRING
      // SCALAR → "cannot extract elements from a scalar" (E2E r28c catch —
      // the psql text→jsonb cast had masked this).
      body: JSON.stringify({ p_order_id: order_id, p_items: items }),
    });
    const data = await rpcRes.json().catch(() => ({}));
    if (!rpcRes.ok) {
      console.error('[API /orders/cancel-items] RPC failed:', rpcRes.status, data);
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
