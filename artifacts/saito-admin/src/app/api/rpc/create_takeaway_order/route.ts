import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { resolveLocationContext } from '@/lib/location-context';

/**
 * Creates a new takeaway (Gel-Al) order via DB RPC.
 * Generates order number, creates order + items, returns order_id.
 *
 * D-5 (2026-09-09): orders.location_id / organization_id are NOT NULL with no
 * default. The order's location is resolved SERVER-SIDE from the operator's
 * active location context (session -> primary -> single-active) and passed to
 * the RPC. Never defaulted. If it cannot be resolved -> 400 NO_LOCATION_CONTEXT.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    const staffId = auth.user?.id || null;
    const ctx = staffId ? await resolveLocationContext(staffId) : null;
    if (!ctx || !ctx.locationId) {
      return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('create_takeaway_order', {
      p_customer_phone: body.p_customer_phone || null,
      p_customer_name: body.p_customer_name || null,
      p_customer_note: body.p_customer_note || null,
      p_estimated_pickup_time: body.p_estimated_pickup_time || null,
      p_items: body.p_items || [],
      p_performed_by: staffId,
      p_location_id: ctx.locationId,
      p_organization_id: ctx.organizationId,
    });

    if (error) {
      console.error('[create_takeaway_order] RPC error:', error);
      if (String(error.message || '').includes('NO_LOCATION_CONTEXT')) {
        return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[create_takeaway_order] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
