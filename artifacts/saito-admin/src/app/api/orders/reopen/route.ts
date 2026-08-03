import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const { order_id, terminal_id } = await req.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    const s = svc();
    const result = await fetch(`${s.url}/rest/v1/rpc/reopen_order_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_order_id: order_id,
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: terminal_id || null,
      }),
    });

    const data = await result.json();
    if (!result.ok || data?.error) {
      return NextResponse.json({ error: data?.error || 'Reopen failed' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /orders/reopen] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
