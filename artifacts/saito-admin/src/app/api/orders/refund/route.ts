import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('payments.refund', ['cashier', 'admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(request, auth.authenticated)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  const supabase = await createAuthClient();
  const { order_id, amount, method, reason } = await request.json();
  if (!order_id || !amount) {
    return NextResponse.json({ error: 'order_id and amount are required' }, { status: 400 });
  }

  let sessionId: string | null = null;
  if ((method || 'cash') === 'cash' || (method || 'cash') === 'nağd') {
    try {
      const s = svc();
      const { data: openSession } = await fetch(
        `${s.url}/rest/v1/cash_drawer_sessions?select=id&status=eq.open&order=opened_at.desc&limit=1`,
        { headers: s.headers }
      ).then((r) => r.json()).then((rows: any) => rows?.[0] || null).catch(() => null);
      if (openSession?.id) sessionId = openSession.id;
    } catch (e) {
      console.error('[refund] cash session lookup failed (non-fatal):', e);
    }
  }

  const { data, error } = await supabase.rpc('refund_payment_atomic', {
    p_order_id: order_id,
    p_amount: Number(amount),
    p_method: method || 'cash',
    p_reason: reason || null,
    p_performed_by: auth.user?.id || null,
    p_cash_drawer_session_id: sessionId,
  });

  if (error) {
    console.error('[refund] RPC failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
