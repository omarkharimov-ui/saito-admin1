import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/**
 * G1 (O frozen contract): the LIVE order-status transition path.
 *
 * Forwards to `transition_order_atomic` — the canonical permissioned +
 * location-scoped + audited + outbox-emitting function. Identity comes
 * EXCLUSIVELY from the session token (current_staff_id()); any
 * caller-supplied `p_performed_by` / `p_employee_name` is rejected up front
 * and MUST NOT be forwarded (identity spoofing was O-01).
 *
 * The route is kept at this URL for backward compatibility with the POS
 * state-machine hook; the old unguarded `transition_order_status` function
 * was DROPPED (migrations 20260911000028/029/030).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();

    // Identity is session-only. Refuse spoofable identity fields outright.
    if (body.p_performed_by !== undefined || body.p_employee_name !== undefined
      || body.p_ip_address !== undefined || body.p_device_id !== undefined) {
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
    const res = await fetch(`${s.url}/rest/v1/rpc/transition_order_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_token: auth.token,
        p_order_id,
        p_new_status,
        p_reason: body.p_reason ?? null,
        p_metadata: body.p_metadata ?? null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Map DB guard errors to a stable client contract
      const msg = (data?.error || (typeof data?.message === 'string' ? data.message : '')) as string;
      let status = 400;
      let code = 'TRANSITION_FAILED';
      if (msg.includes('PERMISSION_DENIED')) { status = 403; code = 'PERMISSION_DENIED'; }
      else if (msg.includes('MANAGER_OVERRIDE_REQUIRED')) { status = 403; code = 'MANAGER_OVERRIDE_REQUIRED'; }
      else if (msg.includes('INVALID_TRANSITION')) { status = 422; code = 'INVALID_TRANSITION'; }
      else if (msg.includes('ORDER_NOT_FOUND')) { status = 404; code = 'ORDER_NOT_FOUND'; }
      else if (msg.includes('Session expired') || msg.includes('Session revoked')) { status = 401; code = 'SESSION_INVALID'; }
      return NextResponse.json({ success: false, error: code, detail: msg }, { status });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[transition_order_status] Fatal:', e);
    return NextResponse.json({ error: e?.message || 'Transition failed' }, { status: 500 });
  }
}
