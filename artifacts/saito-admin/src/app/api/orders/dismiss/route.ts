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

/**
 * POST /api/orders/dismiss
 * Dismiss table — state-aware:
 *   DRAFT/SENT/PREPARING → soft-void
 *   READY/SERVED → waste (stock already consumed)
 *   Paid orders → skipped (require refund workflow)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
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

    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/dismiss_table_state_aware`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_table_number: table_number,
        p_performed_by: auth.user.id,
        p_reason: 'dismissed_from_pos',
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error('[Dismiss]', errText);
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    const result = await rpcRes.json();

    // Cancel any linked reservations
    const tablesRes = await fetch(`${s.url}/rest/v1/table_floors?select=id,reservation_id,status&table_number=eq.${table_number}`, { headers: s.headers });
    const tables = await tablesRes.json();
    const reservationIds = Array.from(new Set((tables || []).filter((t: any) => t.reservation_id && t.status === 'reserved').map((t: any) => t.reservation_id)));

    for (const resId of reservationIds) {
      await fetch(`${s.url}/rest/v1/reservations?id=eq.${resId}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ status: 'cancelled', note: 'Masa boşaldıldı' }),
      });
    }

    return NextResponse.json({ success: true, result, cancelledReservations: reservationIds.length });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
