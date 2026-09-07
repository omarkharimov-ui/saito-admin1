import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * Guest arrival / seating for a reservation (Phase-1 G3).
 *
 * Canonical backend operation: public.seat_guests_atomic(p_reservation_id, p_performed_by).
 * This route previously invoked confirm_and_checkin_atomic with an empty table list,
 * which always failed ("At least one table required") and did NOT represent guest
 * arrival. It is now aligned with the canonical seating operation used by the POS.
 * (No change to seat_guests_atomic itself - it is part of the frozen foundation.)
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission('pos.use');
  if (!auth.authenticated) return auth;

  if (!validateCsrfToken(request, auth.authenticated)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const reservation_id = body?.reservation_id ?? null;
    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const supabase = await createAuthClient();
    const performed_by = body?.performed_by || auth.user?.id || null;

    const { data, error } = await supabase.rpc('seat_guests_atomic', {
      p_reservation_id: reservation_id,
      p_performed_by: performed_by,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Canonical RPC returns { success:false, error:'G_*' } for business-level rejects
    // (reservation state, capacity, no tables). Surface the code for the UI.
    if (data && data.success === false) {
      return NextResponse.json({ error: data.error || 'G_SEAT_FAILED' }, { status: 409 });
    }

    return NextResponse.json(data || { success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
