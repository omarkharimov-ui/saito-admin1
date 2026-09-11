import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { resolveReadLocationScope } from '@/lib/location-context';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/**
 * G7 (O frozen contract): kitchen queue reads require `kitchen.view` and are
 * scoped to the operator's ACTIVE LOCATION (server-trusted). The kitchen page is
 * staff-session-gated by the global middleware (/kitchen is not public), so a
 * valid session is guaranteed before this runs; we add the location scope +
 * read permission so no cross-location queue is ever leaked.
 */
export async function GET(request: NextRequest) {
  try {
    if (!svc().url || !svc().headers['apikey']) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const auth = await requirePermission('kitchen.view');
    if (!auth.authenticated) return auth;
    // G7: active-location scope for reads. Falls back to the org's single
    // location for staff without an explicit binding (single-location prod =>
    // no leakage); fails CLOSED (empty) only if it truly cannot be scoped.
    const lctx = auth.user?.id ? await resolveReadLocationScope(auth.user.id) : null;
    const sessLoc = lctx?.locationId || null;
    if (!sessLoc) {
      return NextResponse.json([]);
    }

    const { url, headers } = svc();
    const queryParams = new URLSearchParams({
      select: '*,order_items(*,products(image_url,translations)),merged_into_table:orders!merged_into(table_number)',
      'table_number': 'gt.0',
      'status': 'not.in.(paid,cancelled,closed,completed)',
      'kitchen_status': 'neq.completed',
      // G7: active-location scope
      'location_id': `eq.${sessLoc}`,
      order: 'created_at.desc',
    });

    const res = await fetch(`${url}/rest/v1/orders?${queryParams.toString()}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Kitchen orders fetch failed: ${res.status} ${text}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Kitchen orders fetch failed' }, { status: 500 });
  }
}
