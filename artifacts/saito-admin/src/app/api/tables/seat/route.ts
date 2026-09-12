import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    // F-01 (frozen): seat is a floor-staff op → `orders.create` (host/kitchen
    // lack it and were previously able to seat via requireAuth — closed).
    const auth = await requirePermission('orders.create');
    if (!auth.authenticated) return auth;

    const { table_number, guest_count } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const s = svc();
    const guests = Math.max(1, Math.min(99, Number(guest_count) || 1));

    // F-02/F-03 (frozen): this route uses the SERVICE ROLE (bypasses RLS) and
    // filters by table_number, which after F-03 is only unique PER location.
    // Scope to the caller's ACTIVE location (server-trusted, from session).
    let locFilter = '';
    const token: string = auth.token || '';
    if (token) {
      const sessRes = await fetch(`${s.url}/rest/v1/sessions?select=active_location_id&token=eq.${encodeURIComponent(token)}&limit=1`, { headers: s.headers });
      const sess = await sessRes.json().catch(() => []);
      const locId = Array.isArray(sess) ? sess[0]?.active_location_id : null;
      if (locId) locFilter = `&location_id=eq.${encodeURIComponent(locId)}`;
    }

    const tablesRes = await fetch(
      `${s.url}/rest/v1/table_floors?select=id,status,reservation_id&table_number=eq.${table_number}&is_archived=eq.false${locFilter}`,
      { headers: s.headers }
    );
    const tables = await tablesRes.json();
    if (!tables || tables.length === 0) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }
    if (tables.some((t: any) => t.status === 'reserved')) {
      return NextResponse.json({ error: 'Table is reserved' }, { status: 409 });
    }
    // L4 invariant (ratified 2026-09-12, "dirty preserved"): `dirty` is the
    // post-payment cleanup state — the table must NEVER be (re)seated while
    // dirty; the only dirty -> empty path is the canonical Clear operation
    // (/api/orders/clear-table -> clear_table_atomic). DIRTY -> NEW SEAT denied.
    if (tables.some((t: any) => t.status === 'dirty')) {
      return NextResponse.json({ error: 'Table is dirty — clear it before seating' }, { status: 409 });
    }

    // Same-location + non-archived scope on the PATCH (service role bypasses RLS).
    const patchRes = await fetch(
      `${s.url}/rest/v1/table_floors?table_number=eq.${table_number}&is_archived=eq.false${locFilter}`,
      {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'occupied',
          guest_count: guests,
          last_activity_at: new Date().toISOString(),
        }),
      }
    );

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error('[Seat Fatal]', errText);
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    return NextResponse.json({ success: true, table_number, guest_count: guests });
  } catch (error: any) {
    console.error('[API /tables/seat] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
