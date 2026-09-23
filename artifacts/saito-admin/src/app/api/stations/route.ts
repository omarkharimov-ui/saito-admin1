import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/stations — BDS #27/#28.
 *
 * Active kitchen stations (SSOT: `stations` table) for the product form
 * station selector and KDS station boards. Read via service role because
 * the stations RLS policy (stations_select_loc) is location-scoped and the
 * browser client's plain Supabase JWT does not always carry that context —
 * the API route is the reliable, audited path (same pattern as
 * /api/admin/products).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    // 2026-09-23 (owner, station model): stations now carry a `station_type`.
    // The kitchen family (kitchen/bar/grill/prep/service/other) drives KDS
    // boards + product routing; the BDS family (delivery/pickup) drives the
    // /admin/bds board tabs. `?kind=` selects the family; default = all
    // (back-compat). Consumers MUST pass an explicit kind so a seeded
    // delivery/pickup station never leaks into a kitchen board.
    const KITCHEN = ['kitchen', 'bar', 'grill', 'prep', 'service', 'other'];
    const BDS = ['delivery', 'pickup'];
    const kind = new URL(request.url).searchParams.get('kind');
    const typeFilter = kind === 'kitchen'
      ? `station_type=in.(${KITCHEN.map(k => `'${k}'`).join(',')})`
      : kind === 'bds'
        ? `station_type=in.(${BDS.map(k => `'${k}'`).join(',')})`
        : '';
    const where = typeFilter ? `&${typeFilter}` : '';

    const res = await fetch(
      `${url}/rest/v1/stations?select=id,name,station_type,is_active,sort_order&order=sort_order.asc,name.asc${where}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to load stations' }, { status: 502 });

    const stations = await res.json();
    return NextResponse.json(Array.isArray(stations) ? stations : []);
  } catch (e: any) {
    console.error('[stations] Fatal:', e);
    return NextResponse.json({ error: e?.message || 'Failed to load stations' }, { status: 500 });
  }
}
