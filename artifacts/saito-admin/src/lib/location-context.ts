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
