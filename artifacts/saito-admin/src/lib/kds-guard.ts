import { NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

/**
 * G3 (O/K frozen contract): canonical KDS item/order mutation guard.
 *
 * Every live KDS mutation route MUST call this before invoking a DB mutation.
 * It enforces the three things the legacy unguarded paths were missing (K-04):
 *   1. (optional) REAL permission via has_permission (role-based) — pass a
 *      permission for routes whose DB fn does NOT do its own registry check.
 *      For routes that call a canonical fn which does the registry permission
 *      check in-DB (item_kitchen_terminal / item_set_hold / item_kitchen_step),
 *      OMIT permission and let the DB be the source of truth.
 *   2. LOCATION scope: the acting staff must have an ACTIVE staff_locations row
 *      for the ORDER's location (server-resolved, never client-supplied).
 *   3. SESSION identity: returns the verified staffId + token; the route records
 *      performed_by = staffId (from the session) and passes p_token = token.
 *      NEVER a client-supplied performed_by.
 *
 * `orderRef` = { order_id } or { order_item_id } (or both).
 */
export type KdsGuardResult =
  | { ok: true; order_id: string; location_id: string; performed_by: string; token: string }
  | { ok: false; res: NextResponse };

export async function requireKdsAction(
  orderRef: { order_id?: string; order_item_id?: string },
  permission?: string
): Promise<KdsGuardResult> {
  // 1. identity (always) — verified session
  const auth = await requireAuth();
  if (!auth.authenticated) return { ok: false, res: auth as NextResponse };
  const staffId: string = auth.user?.id;
  const token: string = auth.token;
  if (!staffId || !token) return { ok: false, res: NextResponse.json({ error: 'No staff identity' }, { status: 401 }) };

  // 2. (optional) explicit permission — for routes whose DB fn does not self-check
  if (permission) {
    const supabase = await createAuthClient();
    const { data: has, error: permErr } = await supabase.rpc('has_permission', {
      p_staff_id: staffId,
      p_permission: permission,
    });
    if (permErr || !has) {
      try {
        await supabase.from('security_events').insert({
          staff_id: staffId, event_type: 'permission_denied', success: false,
          metadata: { permission, context: 'kds_guard' },
        });
      } catch { /* non-critical */ }
      return { ok: false, res: NextResponse.json({ error: 'PERMISSION_DENIED: requires ' + permission }, { status: 403 }) };
    }
  }

  // 3. resolve the order + its location (server-side)
  const supabase = await createAuthClient();
  let order_id = orderRef.order_id || null;
  let location_id: string | null = null;

  if (!order_id && orderRef.order_item_id) {
    const { data } = await supabase
      .from('order_items')
      .select('order_id, orders(location_id)')
      .eq('id', orderRef.order_item_id)
      .maybeSingle();
    if (!data) return { ok: false, res: NextResponse.json({ error: 'Order item not found' }, { status: 404 }) };
    order_id = data.order_id as string;
    // PostgREST embeds orders as an array -> [0].location_id
    const embedded: any = (data as any).orders;
    location_id = Array.isArray(embedded) ? embedded[0]?.location_id ?? null : embedded?.location_id ?? null;
  }
  if (!order_id) return { ok: false, res: NextResponse.json({ error: 'order_id or order_item_id required' }, { status: 400 }) };

  if (!location_id) {
    const { data: o } = await supabase.from('orders').select('id, location_id').eq('id', order_id).maybeSingle();
    if (!o) return { ok: false, res: NextResponse.json({ error: 'Order not found' }, { status: 404 }) };
    location_id = o.location_id as string;
  }

  // 4. location scope: staff must have an active staff_locations row for the
  //    order's location (multi-location isolation; single-location orgs pass).
  if (location_id) {
    const { data: locs } = await supabase
      .from('staff_locations').select('location_id')
      .eq('staff_id', staffId).eq('location_id', location_id).eq('active', true)
      .maybeSingle();
    if (!locs) {
      return { ok: false, res: NextResponse.json({ error: 'FORBIDDEN_LOCATION: no access to this order\'s location' }, { status: 403 }) };
    }
  }

  return { ok: true, order_id, location_id: location_id || '', performed_by: staffId, token };
}
