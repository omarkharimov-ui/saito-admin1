import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

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

    const applyVat = !!body.applyVat;

    // W-A2 D13 (2026-09-19): server-sourced prices — the client's unit_price is
    // IGNORED (same contract as add_item_atomic). Fetch the products once and
    // price from the DB; a missing product fails the whole order (400) instead
    // of silently writing a client-chosen price (underpay gap in frozen G3).
    const productIds: string[] = items.map((i: any) => String(i.product_id || '')).filter(Boolean);
    const uniqueIds: string[] = Array.from(new Set(productIds));
    if (uniqueIds.length !== items.length || uniqueIds.length === 0) {
      return NextResponse.json({ error: 'Each item needs a valid product_id' }, { status: 400 });
    }
    const prodRes = await fetch(
      `${s.url}/rest/v1/products?id=in.(${uniqueIds.map((id) => `"${id}"`).join(',')})&select=id,name,price`,
      { headers: s.headers }
    );
    if (!prodRes.ok) {
      return NextResponse.json({ error: 'Product lookup failed' }, { status: 500 });
    }
    const prodRows: any[] = await prodRes.json();
    const prodMap = new Map<string, any>(prodRows.map((r: any) => [r.id, r]));
    const missing = uniqueIds.find((id) => !prodMap.has(id));
    if (missing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 400 });
    }
    const pricedItems: { product_id: string; product_name: string; quantity: number; unit_price: number }[] = items.map((i: any) => {
      const p = prodMap.get(String(i.product_id));
      return { product_id: p.id, product_name: p.name, quantity: i.quantity || 1, unit_price: Number(p.price) };
    });
    const totalFromItems = pricedItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);

    // W-A2 D12: mint the add-to-check credential. Raw token returned ONCE in the
    // response (menu UI keeps it in localStorage); only the SHA-256 hash is
    // stored, so a DB leak cannot authenticate adds.
    const checkToken = randomBytes(32).toString('hex');
    const checkTokenHash = createHash('sha256').update(checkToken).digest('hex');

    // W-A1 (delegated GO 2026-09-19, W_A1_PLAN.md D1-D5): optional guest identity.
    // Additive — an absent customer_phone keeps the exact G3 contract (customer_id NULL).
    let customerId: string | null = null;
    let customerName: string | null = null;
    let customerPhone: string | null = null;
    const phoneIn = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
    if (phoneIn) {
      const norm = phoneIn.replace(/[\s-]/g, '');
      if (!/^\+?[0-9]{8,15}$/.test(norm)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      }
      const nameIn = typeof body.customer_name === 'string' ? body.customer_name.slice(0, 80) : null;
      const linkRes = await fetch(`${s.url}/rest/v1/rpc/guest_link_customer`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_phone: phoneIn, p_name: nameIn }),
      });
      if (!linkRes.ok) {
        const t = await linkRes.text();
        if (t.includes('GUEST_LINK_BAD_PHONE')) {
          return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
        }
        return NextResponse.json({ error: `Customer link failed: ${t}` }, { status: 500 });
      }
      const linked = await linkRes.json();
      if (!linked?.customer_id) {
        return NextResponse.json({ error: 'Customer link failed: no id returned' }, { status: 500 });
      }
      customerId = linked.customer_id;
      customerName = linked.name ?? null;
      customerPhone = linked.phone ?? null;
    }

    // W-A2 D17 (2026-09-19, latent production defect — evidence in
    // W_A2_PLAN.md): the F-05 sync fires on the order INSERT while the floor
    // row is still in a released state; table_release_guard then raises
    // TABLE_OPEN_ORDERS (released table + open order), so the FIRST QR order
    // on any free ('empty'/'cleaning') table 500s. Flip released -> occupied
    // BEFORE the insert. Pointer untouched (F-05 owns current_order_id;
    // validate_table_order_pointer allows occupied + NULL pointer).
    let flippedFloor = false;
    if (table.status === 'empty' || table.status === 'cleaning') {
      const occRes = await fetch(
        `${s.url}/rest/v1/table_floors?table_number=eq.${encodeURIComponent(String(table_number))}&location_id=eq.${encodeURIComponent(table.location_id)}`,
        {
          method: 'PATCH', headers: s.headers,
          body: JSON.stringify({ status: 'occupied', last_activity_at: new Date().toISOString() }),
        }
      );
      if (!occRes.ok) {
        const t = await occRes.text();
        return NextResponse.json({ error: `Table state update failed: ${t}` }, { status: 500 });
      }
      flippedFloor = true;
    }

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
        // W-A1: create-time customer attach (null when no phone — G3 unchanged).
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        // W-A2 D12: add-to-check credential (hash only; raw token in response).
        qr_check_token_hash: checkTokenHash,
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

    // W-A2 D13: items written with server-sourced name/price (pricedItems).
    const itemInserts = pricedItems.map((i: any) => ({
      order_id: activeOrderId,
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.unit_price * i.quantity,
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
      // D17: restore the floor flip (no open orders left -> guard allows 'empty').
      if (flippedFloor) {
        await fetch(
          `${s.url}/rest/v1/table_floors?table_number=eq.${encodeURIComponent(String(table_number))}&location_id=eq.${encodeURIComponent(table.location_id)}`,
          { method: 'PATCH', headers: s.headers, body: JSON.stringify({ status: 'empty' }) }
        );
      }
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

    // W-A2 D12: checkToken is the add-to-check credential (raw, one-time).
    return NextResponse.json({ success: true, orderId: activeOrderId, total: finalTotal, checkToken, customer: customerId ? { id: customerId, linked: true } : null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
