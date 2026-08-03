import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['waiting', 'checked_in', 'cancelled', 'no_show', 'expired'],
  waiting: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['pending'],
  no_show: ['pending'],
  expired: ['pending'],
  archived: ['pending'],
  waiting_list: ['waiting', 'checked_in', 'cancelled', 'no_show'],
};

function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const { id, reservation_id, status, notes } = await request.json();
    const reservationId = id || reservation_id;

    if (!reservationId || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const s = svc();

    // 1. Fetch current reservation
    const resRes = await fetch(`${s.url}/rest/v1/reservations?select=*&id=eq.${reservationId}`, { headers: s.headers });
    const resData: any[] = await resRes.json();
    const current = resData?.[0];

    if (!current) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // 2. Validate transition
    if (!isValidTransition(current.status, status)) {
      return NextResponse.json({
        error: `Cannot transition from '${current.status}' to '${status}'`,
      }, { status: 409 });
    }

    // 3. For cancellations/no_show/expired, use atomic RPC
    if (status === 'cancelled' || status === 'no_show' || status === 'expired') {
      const rpcRes = await fetch(`${s.url}/rest/v1/rpc/cancel_reservation_atomic`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({
          p_reservation_id: reservationId,
          p_reason: notes || status,
          p_performed_by: auth.user?.id || null,
        }),
      });

      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        return NextResponse.json({ error: errText }, { status: 400 });
      }

      const rpcData = await rpcRes.json();
      return NextResponse.json(rpcData);
    }

    // 4. Handle guest arrival: atomic flow for pending reservations
    if (status === 'checked_in' && current.status === 'pending') {
      const tableIdsJson = current.table_ids ? (typeof current.table_ids === 'string' ? current.table_ids : JSON.stringify(current.table_ids)) : '[]';
      const rpcRes = await fetch(`${s.url}/rest/v1/rpc/confirm_and_checkin_atomic`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({
          p_reservation_id: reservationId,
          p_table_ids: JSON.parse(tableIdsJson),
          p_user_id: (auth.user?.id || null) as any,
        }),
      });
      const rpcData = await rpcRes.json();
      if (!rpcRes.ok || rpcData?.error) {
        return NextResponse.json({ error: rpcData?.error || 'Confirm & Check In failed' }, { status: 400 });
      }
      return NextResponse.json(rpcData);
    }

    // 5. Update reservation for other transitions
    const updatePayload: Record<string, any> = { status };
    if (notes) updatePayload.note = notes;
    if (status === 'checked_in') updatePayload.checked_in_at = new Date().toISOString();
    if (status === 'completed') updatePayload.completed_at = new Date().toISOString();

    await fetch(`${s.url}/rest/v1/reservations?id=eq.${reservationId}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify(updatePayload),
    });

    return NextResponse.json({ success: true, status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
