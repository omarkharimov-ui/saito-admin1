import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { shiftGate } from '@/lib/shiftLock';

// P-6 D-1 (ratified 2026-09-13): reopen is a FULL financial reversal (the RPC
// DELETEs every order_payments row). The route now requires `orders.edit`; the
// RPC additionally enforces a MANAGER OVERRIDE (refund.approve / void.approve /
// approved manager_overrides) + location scope (P-1) + session-token identity
// (O-01: identity comes from the session, never from client input).

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    // P-6 D-1: RBAC gate (registry: paid→new / refunded→new / closed→new /
    // partially_refunded→new all require orders.edit). The manager OVERRIDE is
    // enforced inside the RPC (it knows the current order state).
    const perm = await requirePermission('orders.edit');
    if (perm instanceof NextResponse) return perm;

    const body = await req.json().catch(() => ({}));
    const shiftCheck = await shiftGate(req, body);
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error, pin_required: !!shiftCheck.pin_required }, { status: 403 });
    }

    const { order_id, terminal_id } = body;
    if (!order_id) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    // P-6 D-1: the session token is passed so the RPC re-derives identity from
    // the session (O-01); the RPC rejects a p_performed_by that does not match.
    const token = (await cookies()).get('saito_token')?.value || null;

    const s = svc();
    const result = await fetch(`${s.url}/rest/v1/rpc/reopen_order_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_token: token,
        p_order_id: order_id,
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: terminal_id || null,
      }),
    });

    const data = await result.json();
    if (!result.ok || data?.error) {
      // P-6 D-1: stable client contract for the new server-side guards
      const msg = String(data?.error || '');
      let status = 400; let code = 'REOPEN_FAILED';
      if (msg.startsWith('PERMISSION_DENIED')) { status = 403; code = 'PERMISSION_DENIED'; }
      else if (msg.startsWith('MANAGER_OVERRIDE_REQUIRED')) { status = 403; code = 'MANAGER_OVERRIDE_REQUIRED'; }
      else if (msg.startsWith('IDENTITY_MISMATCH')) { status = 403; code = 'IDENTITY_MISMATCH'; }
      return NextResponse.json({ error: msg, code }, { status });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /orders/reopen] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
