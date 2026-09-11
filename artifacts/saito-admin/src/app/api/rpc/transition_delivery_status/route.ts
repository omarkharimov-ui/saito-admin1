import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/**
 * G1 (O frozen contract): delivery-status transition path, token-first.
 *
 * Forwards to the token-first `transition_delivery_status` (identity from the
 * session token only). Caller-supplied `p_performed_by` / `p_employee_name`
 * are rejected up front (identity spoofing, O-01 class).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();

    if (body.p_performed_by !== undefined || body.p_employee_name !== undefined) {
      return NextResponse.json(
        { error: 'Caller-supplied identity is not accepted; identity comes from the session' },
        { status: 400 }
      );
    }

    const { p_order_id, p_new_status } = body;
    if (!p_order_id || !p_new_status) {
      return NextResponse.json({ error: 'p_order_id and p_new_status are required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/rpc/transition_delivery_status`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_token: auth.token,
        p_order_id,
        p_new_status,
        p_courier_id: body.p_courier_id || null,
        p_courier_name: body.p_courier_name || null,
        p_performed_by_terminal_id: body.p_performed_by_terminal_id || null,
        p_metadata: body.p_metadata || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data?.error || (typeof data?.message === 'string' ? data.message : '')) as string;
      let status = 400;
      let code = 'TRANSITION_FAILED';
      if (msg.includes('FORBIDDEN')) { status = 403; code = 'FORBIDDEN'; }
      else if (msg.includes('Order not found')) { status = 404; code = 'ORDER_NOT_FOUND'; }
      else if (msg.includes('Session expired') || msg.includes('Session revoked')) { status = 401; code = 'SESSION_INVALID'; }
      return NextResponse.json({ success: false, error: code, detail: msg }, { status });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[transition_delivery_status] Fatal:', e);
    return NextResponse.json({ error: e?.message || 'Transition failed' }, { status: 500 });
  }
}
