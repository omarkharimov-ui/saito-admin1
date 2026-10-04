import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// 13d-A2: service-role bridge for the `reverse_stock_for_items` RPC.
// ROOT CAUSE (audit 13d-A RPC layer): EXECUTE is granted ONLY to
// postgres/service_role — browser anon calls get 401. Both OrderModal
// call sites (draft qty-reduction reversal + partial-cancel reversal)
// awaited without checking `.error` → stock was silently NOT returned
// when an already-consumed (READY) item was reduced/cancelled.
// No-op for never-consumed items (idempotency-keyed in the RPC).
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('pos.use');
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { items } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items[] is required' }, { status: 400 });
    }
    for (const it of items) {
      if (!it?.order_item_id) return NextResponse.json({ error: 'each item needs order_item_id' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    const rpcRes = await fetch(`${url}/rest/v1/rpc/reverse_stock_for_items`, {
      method: 'POST',
      headers,
      // p_items is TEXT — JSON string, same wire shape the browser sent.
      body: JSON.stringify({ p_items: JSON.stringify(items) }),
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
