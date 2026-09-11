import { createAuthClient } from '@/lib/api-auth';
import { cookies } from 'next/headers';

/**
 * Resolves the operator's active location + organization for order-creation
 * operations that require both (takeaway/delivery).
 *
 * Policy (approved 2026-09-09, D-5):
 *   1. sessions.active_location_id of the CURRENT session (authoritative,
 *      set via /api/locations/switch — the same session the UI sees)
 *   2. staff's PRIMARY active staff_locations row
 *   3. the staff's ONLY active location (if exactly 1 distinct)
 *   4. otherwise null -> caller must return 400 NO_LOCATION_CONTEXT
 *
 * Never defaults, never picks arbitrarily: wrong location would mis-route
 * inventory, reporting, kitchen and cash/shift data.
 *
 * Uses the same saito_token cookie + service-role client as
 * /api/locations/context, so resolution always matches the UI's context.
 */
export async function resolveLocationContext(staffId: string): Promise<{
  locationId: string;
  organizationId: string;
} | null> {
  const svc = await createAuthClient();
  if (!svc) return null;

  // 1) current session's active location (authoritative when present)
  try {
    const token = (await cookies()).get('saito_token')?.value;
    if (token) {
      const { data: session } = await svc
        .from('sessions')
        .select('user_id, active_location_id, organization_id')
        .eq('token', token)
        .maybeSingle();
      if (session?.active_location_id) {
        return {
          locationId: session.active_location_id,
          organizationId: session.organization_id || '',
        };
      }
    }
  } catch {
    // fall through to staff_locations
  }

  // 2) staff's primary active location
  try {
    const { data: primary } = await svc
      .from('staff_locations')
      .select('location_id, organization_id')
      .eq('staff_id', staffId)
      .eq('active', true)
      .eq('is_primary', true)
      .maybeSingle();
    if (primary?.location_id) {
      return { locationId: primary.location_id, organizationId: primary.organization_id || '' };
    }
  } catch {
    // fall through
  }

  // 3) exactly one distinct active location
  try {
    const { data: actives } = await svc
      .from('staff_locations')
      .select('location_id, organization_id')
      .eq('staff_id', staffId)
      .eq('active', true);
    const list = (actives || []) as any[];
    const distinct = new Set(list.map((a) => a.location_id));
    if (distinct.size === 1 && list[0]?.location_id) {
      return { locationId: list[0].location_id, organizationId: list[0].organization_id || '' };
    }
  } catch {
    // fall through
  }

  // 4) ambiguous or none -> caller returns 400 NO_LOCATION_CONTEXT
  return null;
}

/**
 * Resolves the LOCATION SCOPE FOR READS (G7, O frozen contract).
 *
 * Reads (order list, kitchen board) must be location-scoped so no cross-location
 * data leaks — but UNLIKE order-creation (D-5), a read must NOT hard-fail for
 * staff who have no explicit location binding. In a single-location deployment
 * (the production reality: 1 location holds all tables/orders), scoping to that
 * single location is both the correct read scope and leak-free.
 *
 * Resolution order (returns { locationId, organizationId } | null):
 *   1. the operator's ACTIVE location (session -> primary -> single staff_locations)
 *      via resolveLocationContext — authoritative when present.
 *   2. FALLBACK (read-only): if the org has data in EXACTLY ONE location, scope to
 *      it (every read is then within that location -> no cross-location leak).
 *   3. null -> caller returns 400 (ambiguous: data spans multiple locations AND the
 *      operator cannot be resolved to one). We fail CLOSED, never leak.
 *
 * Uses the saito_token cookie + service-role client, same as resolveLocationContext.
 */
export async function resolveReadLocationScope(staffId: string): Promise<{
  locationId: string;
  organizationId: string;
} | null> {
  // 1) active location (authoritative)
  const active = await resolveLocationContext(staffId);
  if (active) return active;

  // 2) single-location fallback (read-only)
  const svc = await createAuthClient();
  if (!svc) return null;
  try {
    const { data, error } = await svc
      .from('orders')
      .select('location_id')
      .not('location_id', 'is', null);
    if (error) return null;
    const distinct = new Set((data || []).map((r: any) => r.location_id).filter(Boolean));
    if (distinct.size === 1) {
      const locationId = [...distinct][0];
      // organization for the response (best-effort from the same single location)
      const { data: orgRow } = await svc
        .from('locations')
        .select('organization_id')
        .eq('id', locationId)
        .maybeSingle();
      return { locationId, organizationId: orgRow?.organization_id || '' };
    }
  // distinct.size === 0 -> no orders anywhere -> nothing to scope to (caller
  // returns an empty, location-agnostic result is fine; return null => 400 is
  // too strict for "no data", so we let callers treat null-as-empty for reads).
  return null;
  } catch {
    return null;
  }
}

/**
 * L2 (P0 fix, 2026-09-12): resolves the location context for WRITE paths
 * (order create/append/send, walk-in, takeaway, delivery) — the create/send
 * side of the D-5 contract.
 *
 * Root cause (evidence, L1-3): the create path used resolveLocationContext
 * (authoritative chain only: session.active_location_id -> staff primary ->
 * exactly-one staff_locations -> else 400). Real staff have 0 staff_locations
 * rows + NULL active_location_id, while the org operates in exactly ONE
 * location with data (all orders/tables) -> Send to Kitchen 400
 * NO_LOCATION_CONTEXT for every real staff, while the READ path
 * (resolveReadLocationScope) worked via its single-location-with-data
 * fallback. Asymmetric: same session could read but not write.
 *
 * Resolution (server/session-derived, NEVER client-supplied):
 *   1. authoritative D-5 chain (resolveLocationContext) — unchanged, first;
 *   2. FALLBACK (only when the org has data in EXACTLY ONE location): scope to
 *      it — the same single-location-with-data rule the read path applies, so a
 *      correctly-readable deployment is also writable;
 *   3. otherwise null -> caller returns 400 NO_LOCATION_CONTEXT (fail closed:
 *      a genuinely multi-location org with an unbound staff must NOT have a
 *      write location guessed — wrong location would mis-route inventory,
 *      reporting, kitchen and cash/shift data, per D-5).
 */
export async function resolveWriteLocationContext(staffId: string): Promise<{
  locationId: string;
  organizationId: string;
} | null> {
  // 1) authoritative (session active location -> staff primary -> single active)
  const authoritative = await resolveLocationContext(staffId);
  if (authoritative) return authoritative;

  // 2) single-location-with-data fallback (mirror of the read-path rule)
  const svc = await createAuthClient();
  if (!svc) return null;
  try {
    const { data } = await svc
      .from('orders')
      .select('location_id')
      .not('location_id', 'is', null);
    const distinct = new Set((data || []).map((r: any) => r.location_id).filter(Boolean));
    if (distinct.size === 1) {
      const locationId = [...distinct][0];
      const { data: orgRow } = await svc
        .from('locations')
        .select('organization_id')
        .eq('id', locationId)
        .maybeSingle();
      return { locationId, organizationId: orgRow?.organization_id || '' };
    }
  } catch {
    // fall through -> fail closed
  }
  // 3) ambiguous (multi-location data) or none -> caller returns 400
  return null;
}
