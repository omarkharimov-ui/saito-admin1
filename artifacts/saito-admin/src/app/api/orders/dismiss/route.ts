import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { paymentRateLimit } from '@/lib/rate-limit';
import { verifyManagerPin } from '@/lib/managerPin';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    // F-01 (frozen): dismiss cancels the order (money) → manager-level `floor.manage`.
    // F-02 (frozen): p_token = session identity; the RPC enforces permission + location.
    const auth = await requirePermission('floor.manage');
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const rateLimitResult = paymentRateLimit(req);
    if (rateLimitResult) return rateLimitResult;

    const body = await req.json().catch(() => ({}));
    const { table_number, manager_pin, reason, terminal_id } = body;
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    // QF3 (RED #2): the dine-in "MASANI BOŞALT" destructive path runs through
    // dismiss_table_atomic — the UI PIN gate sends manager_pin here and it is
    // verified. Takeaway/delivery cancels don't send a PIN and stay ungated
    // (a normal cancel, not a destructive table wipe).
    if (manager_pin) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const pinCheck = await verifyManagerPin(String(manager_pin), ip);
      if (!pinCheck.ok) {
        return NextResponse.json({ error: pinCheck.error, pin_required: true }, { status: 403 });
      }
    }

    const s = svc();
    // L3 (D3 fix): dismiss_table_atomic (F01/F03 signature) requires ALL 6
    // params — no defaults. The route previously passed only 4 -> PGRST202 ->
    // every dismiss 404'd with "Dismiss failed" (the user-visible bug).
    // p_final_status='empty' is the canonical dismiss semantics (customer gone,
    // order cancelled, table freed); 'cleaning' is a separate mark-dirty flow.
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/dismiss_table_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_token: auth.token,
        p_table_number: Number(table_number),
        p_reason: reason || 'dismiss_table',
        p_final_status: 'empty',
        p_performed_by: auth.user.id,
        p_terminal_id: terminal_id || null,
      }),
    });

    const rpcData = await rpcRes.json();
    if (!rpcRes.ok || !rpcData?.success) {
      const message = rpcData?.error || 'Dismiss failed';
      console.error('[API /orders/dismiss] RPC error:', message);
      const status = rpcData?.error === 'PERMISSION_DENIED' || rpcData?.error === 'FORBIDDEN_LOCATION' ? 403
        : rpcData?.error === 'FORBIDDEN' ? 401 : rpcRes.ok ? 400 : rpcRes.status;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ success: true, result: rpcData });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
