import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const { order_id, terminal_id } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const s = svc();

    // Atomic mark-ready: handles kitchen status transition and inventory deduction
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/mark_ready_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_order_id: order_id,
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: terminal_id || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return NextResponse.json({ error: `Mark ready failed: ${errText}` }, { status: 400 });
    }

    const data = await rpcRes.json();
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error('[API /orders/mark-ready] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
