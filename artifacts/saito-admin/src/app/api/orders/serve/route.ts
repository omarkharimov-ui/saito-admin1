import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * POST /api/orders/serve — 12i (owner): "servis et buttonu POS-da olacaq".
 * The SERVE action belongs to the FLOOR (server), not the kitchen: POS's
 * "Servisə Ver" first calls this route — mark_order_served_atomic flips every
 * ready kitchen item → served (all-ready invariant, idempotent noop for
 * drink-only orders), the sync_order_kitchen_status rollup moves the order
 * to 'served', and the KDS/BDS boards read "SERVİS EDİLDİ". Only then does
 * the POS transition the order status (existing flow).
 * floor.manage (same family as the floor's dismiss/bill actions) + CSRF.
 */
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('floor.manage');
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { order_id } = body;
    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

    const s = svc();
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/mark_order_served_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_order_id: order_id, p_performed_by: auth.user.id }),
    });
    const rpcData = await rpcRes.json().catch(() => ({}));

    if (!rpcRes.ok || !rpcData?.success) {
      const message = rpcData?.error || 'Serve failed';
      const status = message === 'ORDER_NOT_FULLY_READY' ? 409
        : message === 'PERMISSION_DENIED' || message === 'FORBIDDEN_LOCATION' ? 403
        : rpcRes.ok ? 400 : rpcRes.status;
      return NextResponse.json({ error: message, ...rpcData }, { status });
    }

    return NextResponse.json({ success: true, result: rpcData });
  } catch (error: any) {
    console.error('[API /orders/serve] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
