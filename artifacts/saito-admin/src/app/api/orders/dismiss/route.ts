import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { paymentRateLimit } from '@/lib/rate-limit';

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

    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const rateLimitResult = paymentRateLimit(req);
    if (rateLimitResult) return rateLimitResult;

    const { table_number } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const s = svc();
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/dismiss_table_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_table_number: Number(table_number),
        p_performed_by: auth.user.id,
        p_terminal_id: null,
      }),
    });

    const rpcData = await rpcRes.json();
    if (!rpcRes.ok || !rpcData?.success) {
      const message = rpcData?.error || 'Dismiss failed';
      console.error('[API /orders/dismiss] RPC error:', message);
      return NextResponse.json({ error: message }, { status: rpcRes.ok ? 400 : rpcRes.status });
    }

    return NextResponse.json({ success: true, result: rpcData });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
