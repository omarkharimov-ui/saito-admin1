import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { shiftGate } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json().catch(() => ({}));
    const shiftCheck = await shiftGate(request, body);
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error, pin_required: !!shiftCheck.pin_required }, { status: 403 });
    }

    const { waitlist_id, table_number } = body;
    if (!waitlist_id || !table_number) {
      return NextResponse.json({ error: 'waitlist_id and table_number are required' }, { status: 400 });
    }

    const s = svc();

    const waitlistRes = await fetch(`${s.url}/rest/v1/waitlist?id=eq.${waitlist_id}&select=*`, { headers: s.headers });
    const waitlistData = await waitlistRes.json();
    const entry = Array.isArray(waitlistData) ? waitlistData[0] : null;

    if (!entry) {
      return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
    }

    const tableRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}&select=*`, { headers: s.headers });
    const tables = await tableRes.json();
    const table = Array.isArray(tables) ? tables[0] : null;

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    if (table.status !== 'empty') {
      return NextResponse.json({ error: 'Table is not empty' }, { status: 409 });
    }

    // ── FULL SEAT (owner decision 2026-09-25: "walk-in sıl, waitlist keçir") ──
    // Waiting guest -> table occupied + ORDER auto-opened (walk-in parity).
    // Same create contract as /api/orders POST: race-free next_order_number
    // ('ORD-' per location) + REST insert (service role, P5 triggers) +
    // table_floors.current_order_id pointer. Guest identity travels into
    // orders.customer_name/customer_phone so the cashier's cart append
    // keeps it on the SAME order (the active-order guard in /api/orders
    // reuses this order — no second order is ever created).
    const locId = (table.location_id as string) || null;
    const orgId = (table.organization_id as string) || null;
    const nowIso = new Date().toISOString();

    let orderNumber: string | null = null;
    try {
      const numRes = await fetch(`${s.url}/rest/v1/rpc/next_order_number`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_prefix: 'ORD-', p_location: locId }),
      });
      if (numRes.ok) orderNumber = String(await numRes.json());
    } catch { /* order_number stays null — UI falls back to uuid slice */ }

    // SSOT VAT switch (mirrors /api/orders create path; total is 0 anyway).
    let autoApplyVat = false;
    try {
      const vatRes = await fetch(`${s.url}/rest/v1/settings?select=auto_apply_vat&limit=1`, { headers: s.headers });
      if (vatRes.ok) {
        const rows: any = await vatRes.json();
        autoApplyVat = !!(Array.isArray(rows) ? rows[0]?.auto_apply_vat : null);
      }
    } catch { /* fail-closed: no VAT */ }

    const insertRes = await fetch(`${s.url}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        table_number,
        organization_id: orgId,
        location_id: locId,
        total_amount: 0,
        order_number: orderNumber,
        apply_vat: autoApplyVat,
        status: 'new',
        guest_count: entry.guests || 1,
        order_type: 'dine_in',
        order_source: 'dine_in',
        customer_name: entry.name || null,
        customer_phone: entry.phone || null,
        discount_amount: 0,
        is_draft: false,
        version: 1,
        created_by: auth.user?.id || null,
        created_at: nowIso,
        updated_at: nowIso,
      }),
    });
    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('[API /waitlist/seat] order insert failed', insertRes.status, errText);
      return NextResponse.json({ error: `Order açıla bilmədi: ${errText.slice(0, 200)}` }, { status: 500 });
    }
    const created: any = await insertRes.json().catch(() => null);
    const orderId = Array.isArray(created) ? created[0]?.id : created?.id;
    if (!orderId) {
      return NextResponse.json({ error: 'Order açıla bilmədi: id yox' }, { status: 500 });
    }

    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'occupied',
        guest_count: entry.guests || 1,
        reservation_name: entry.name,
        reservation_phone: entry.phone,
        current_order_id: orderId,
        total_amount: 0,
        last_activity_at: nowIso,
      }),
    });

    await fetch(`${s.url}/rest/v1/waitlist?id=eq.${waitlist_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'seated',
        seated_at: nowIso,
      }),
    });

    return NextResponse.json({ success: true, table_number, order_id: orderId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
