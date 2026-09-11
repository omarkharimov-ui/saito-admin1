import { NextRequest, NextResponse } from 'next/server';

// G3: this route is a PUBLIC customer self-service endpoint (see POST docs).
// No requireAuth / requirePermission — the intended contract is table-number
// identification + IP rate limiting, with server-trusted location/org.

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
}

/**
 * G3 (O frozen contract): QR customer self-service order creation.
 *
 * ACCESS MODEL — QR is a PUBLIC customer flow (the /menu page is public, the
 * caller sends NO staff token). The intended authorization contract is
 * table_number-identified + IP rate-limited self-service — it is deliberately
 * NOT gated by staff `requirePermission('orders.create')` (that would kill the
 * customer flow). Do NOT add a staff permission here.
 *
 * LOCATION — server-trusted, cannot be spoofed: the order's location_id +
 * organization_id are taken from the TABLE ROW (table_floors), never from the
 * client body. The client's table_number identifies the table; the location/org
 * follow from it. A colliding table_number in another location is impossible
 * because table_floors.location_id is NOT NULL and the row carries exactly one.
 * The order_type is forced to 'qr_order' server-side (client value ignored).
 *
 * The F-05 order-insert trigger recomputes the table's current_order_id pointer
 * (location-aware) — we do NOT set it manually, and the floor PATCH below is
 * scoped to the resolved location (G4 consistency).
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const { table_number, items } = body;

    if (!table_number || !items?.length) {
      return NextResponse.json({ error: 'table_number and items required' }, { status: 400 });
    }

    const s = svc();

    // Server-trusted location/org from the table row (never the client body).
    const tableRes = await fetch(
      `${s.url}/rest/v1/table_floors?table_number=eq.${encodeURIComponent(String(table_number))}&select=id,status,location_id,organization_id&limit=1`,
      { headers: s.headers }
    );
    const tableData = await tableRes.json();
    const table = Array.isArray(tableData) && tableData[0];
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }
    if (!table.location_id) {
      return NextResponse.json({ error: 'Table has no location context' }, { status: 500 });
    }

    const totalFromItems = items.reduce((s: number, i: any) => s + ((i.unit_price || 0) * (i.quantity || 1)), 0);
    const applyVat = !!body.apply_vat;

    const insertRes = await fetch(`${s.url}/rest/v1/orders`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        table_number,
        // G3: server-trusted location/org (from the table row) — passes
        // trg_order_table_location and keeps the order in its true location.
        location_id: table.location_id,
        organization_id: table.organization_id,
        total_amount: totalFromItems,
        status: 'confirmed',
        kitchen_status: 'pending',
        is_draft: false,
        order_type: 'qr_order', // forced server-side; client order_type ignored
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return NextResponse.json({ error: `Order creation failed: ${errText}` }, { status: 500 });
    }

    const created = await insertRes.json();
    const activeOrderId = created?.[0]?.id;
    if (!activeOrderId) return NextResponse.json({ error: 'Order creation failed: no id returned' }, { status: 500 });

    const itemInserts = items.map((i: any) => ({
      order_id: activeOrderId,
      product_id: i.product_id,
      product_name: i.product_name || '',
      quantity: i.quantity || 1,
      unit_price: i.unit_price || 0,
      total_price: (i.unit_price || 0) * (i.quantity || 1),
      kitchen_status: 'pending',
    }));

    const itemsRes = await fetch(`${s.url}/rest/v1/order_items`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify(itemInserts),
    });

    if (!itemsRes.ok) {
      // Roll back the order so a failed item insert doesn't leave an empty order.
      await fetch(`${s.url}/rest/v1/orders?id=eq.${activeOrderId}`, {
        method: 'PATCH', headers: s.headers,
        body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
      });
      const errText = await itemsRes.text();
      return NextResponse.json({ error: `Order items creation failed: ${errText}` }, { status: 500 });
    }

    // SSOT: recompute total server-side (VAT per apply_vat, service off)
    let finalTotal = totalFromItems;
    if (applyVat) {
      const ssotRes = await fetch(`${s.url}/rest/v1/rpc/calculate_order_total_v3`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_order_id: activeOrderId, p_apply_vat: true, p_apply_service: false }),
      });
      if (ssotRes.ok) {
        const ssot = await ssotRes.json();
        finalTotal = ssot?.total ?? totalFromItems;
      }
    }

    // G4-consistent: floor PATCH scoped to the RESOLVED table location (never a
    // cross-location write via a colliding table_number). current_order_id is
    // maintained by the F-05 order-insert trigger, not set here.
    await fetch(
      `${s.url}/rest/v1/table_floors?table_number=eq.${encodeURIComponent(String(table_number))}&location_id=eq.${encodeURIComponent(table.location_id)}`,
      {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ status: 'occupied', total_amount: finalTotal, last_activity_at: new Date().toISOString() }),
      }
    );

    return NextResponse.json({ success: true, orderId: activeOrderId, total: finalTotal });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
