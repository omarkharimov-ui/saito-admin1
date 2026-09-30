import { NextRequest, NextResponse } from 'next/server';

// PUBLIC online ordering (takeaway/delivery) — customer self-service without a
// table. Same trust model as /api/orders/qr (G3): no staff token, IP rate
// limit, server-trusted location + server-sourced prices (D13).

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string) {
  const now = Date.now();
  // 11g (freeze audit): the map was never evicted — unbounded growth per
  // distinct client IP. Opportunistic sweep of expired entries.
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) if (now > v.resetAt) rateLimitMap.delete(k);
  }
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

// Default serving location: the oldest ACTIVE location (single-restaurant
// operation; all active locations carry delivery_mode='own').
async function defaultLocation(s: { url: string; headers: Record<string, string> }) {
  const res = await fetch(
    `${s.url}/rest/v1/locations?is_active=eq.true&select=id,organization_id,delivery_mode&order=created_at.asc,name.asc&limit=1`,
    { headers: s.headers }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

// GET /api/orders/online — online channel config (delivery zones).
export async function GET() {
  try {
    const s = svc();
    const [loc, zonesRes] = await Promise.all([
      defaultLocation(s),
      fetch(`${s.url}/rest/v1/delivery_zones?is_active=eq.true&select=id,name,fee,min_order,estimated_minutes&order=priority.asc`, { headers: s.headers }),
    ]);
    if (!loc) return NextResponse.json({ error: 'No active location' }, { status: 503 });

    const zones = zonesRes.ok ? await zonesRes.json() : [];
    return NextResponse.json({
      location: { id: loc.id, delivery_mode: loc.delivery_mode },
      delivery_available: loc.delivery_mode === 'own' && (zones as any[]).length > 0,
      zones: zones as any[],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/orders/online — create a takeaway/delivery order.
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const orderType = body.order_type === 'delivery' ? 'delivery' : 'takeaway';
    const { items, customer_name, customer_phone } = body;

    if (!items?.length) return NextResponse.json({ error: 'items required' }, { status: 400 });
    if (typeof customer_name !== 'string' || customer_name.trim().length < 2) {
      return NextResponse.json({ error: 'customer_name required' }, { status: 400 });
    }
    const phoneNorm = typeof customer_phone === 'string' ? customer_phone.replace(/[\s-]/g, '') : '';
    if (!/^\+?[0-9]{8,15}$/.test(phoneNorm)) {
      return NextResponse.json({ error: 'customer_phone required (valid number)' }, { status: 400 });
    }

    const s = svc();
    const loc = await defaultLocation(s);
    if (!loc) return NextResponse.json({ error: 'No active location' }, { status: 503 });

    // Delivery fields (validated server-side).
    let deliveryFee = 0;
    let deliveryZoneName: string | null = null;
    let deliveryAddress: string | null = null;
    let estimatedMinutes: number | null = null;
    let deliveryZone: any = null;
    if (orderType === 'delivery') {
      if (typeof body.delivery_address !== 'string' || body.delivery_address.trim().length < 5) {
        return NextResponse.json({ error: 'delivery_address required' }, { status: 400 });
      }
      deliveryAddress = body.delivery_address.trim().slice(0, 300);
      const zonesRes = await fetch(
        `${s.url}/rest/v1/delivery_zones?is_active=eq.true&select=id,name,fee,min_order,estimated_minutes&order=priority.asc`,
        { headers: s.headers }
      );
      const zones = (zonesRes.ok ? await zonesRes.json() : []) as any[];
      if (zones.length === 0) return NextResponse.json({ error: 'Delivery is not available right now' }, { status: 400 });
      // 11g (freeze audit): an unknown/foreign delivery_zone_id used to
      // silently fall back to zones[0] → wrong fee/ETA/min-order billed.
      // Explicit-but-invalid = 400; absent = default zone.
      deliveryZone = body.delivery_zone_id
        ? zones.find(z => z.id === body.delivery_zone_id)
        : zones[0];
      if (!deliveryZone) return NextResponse.json({ error: 'delivery_zone_id is not valid' }, { status: 400 });
      const zone = deliveryZone;
      deliveryZoneName = zone.name;
      deliveryFee = Number(zone.fee) || 0;
      estimatedMinutes = Number(zone.estimated_minutes) || null;
    }

    // D13: server-sourced prices — client prices are ignored.
    const productIds: string[] = items.map((i: any) => String(i.product_id || '')).filter(Boolean);
    const uniqueIds: string[] = Array.from(new Set(productIds));
    if (uniqueIds.length !== items.length || uniqueIds.length === 0) {
      return NextResponse.json({ error: 'Each item needs a valid product_id' }, { status: 400 });
    }
    const prodRes = await fetch(
      `${s.url}/rest/v1/products?id=in.(${uniqueIds.map((id) => `"${id}"`).join(',')})&select=id,name,price,is_available`,
      { headers: s.headers }
    );
    if (!prodRes.ok) return NextResponse.json({ error: 'Product lookup failed' }, { status: 500 });
    const prodRows: any[] = await prodRes.json();
    const prodMap = new Map<string, any>(prodRows.map((r: any) => [r.id, r]));
    const unavailable = uniqueIds.find((id) => {
      const p = prodMap.get(id);
      return !p || p.is_available === false;
    });
    if (unavailable) return NextResponse.json({ error: 'A product is not available' }, { status: 400 });
    const pricedItems: { product_id: string; product_name: string; quantity: number; unit_price: number }[] = items.map((i: any) => {
      const p = prodMap.get(String(i.product_id));
      return { product_id: p.id, product_name: p.name, quantity: Math.max(1, Math.min(99, Number(i.quantity) || 1)), unit_price: Number(p.price) };
    });
    const itemsTotal = pricedItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

    // Delivery minimum order (items subtotal, before fee). 11g: reuses the
    // validated `zone` from above (it already carries min_order) — the old
    // second fetch re-introduced the same silent-zones[0] fallback.
    if (orderType === 'delivery') {
      const minOrder = Number(deliveryZone?.min_order) || 0;
      if (minOrder > 0 && itemsTotal + deliveryFee < minOrder) {
        return NextResponse.json({ error: `Minimum order for delivery: ₼${minOrder.toFixed(2)}` }, { status: 400 });
      }
    }

    // EDV: settings auto_apply_vat default; explicit client value wins.
    let applyVat = false;
    if (typeof body.applyVat === 'boolean') {
      applyVat = body.applyVat;
    } else {
      try {
        const vatCfgRes = await fetch(`${s.url}/rest/v1/settings?select=auto_apply_vat&limit=1`, { headers: s.headers });
        if (vatCfgRes.ok) {
          const vatCfgRows = await vatCfgRes.json();
          applyVat = !!(vatCfgRows?.[0]?.auto_apply_vat);
        }
      } catch { applyVat = false; }
    }

    // CRM: link/create the guest by phone (loyalty spine — same as QR W-A1).
    let customerId: string | null = null;
    let linkedName: string | null = null;
    let linkedPhone: string | null = null;
    try {
      const linkRes = await fetch(`${s.url}/rest/v1/rpc/guest_link_customer`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_phone: phoneNorm, p_name: customer_name.trim().slice(0, 80) }),
      });
      if (linkRes.ok) {
        const linked = await linkRes.json();
        if (linked?.customer_id) { customerId = linked.customer_id; linkedName = linked.name ?? customer_name.trim(); linkedPhone = linked.phone ?? phoneNorm; }
      }
    } catch { /* identity is optional — the order still goes through */ }

    const now = new Date().toISOString();
    const insertRes = await fetch(`${s.url}/rest/v1/orders`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        table_number: null, // online — no table
        location_id: loc.id,
        organization_id: loc.organization_id,
        total_amount: itemsTotal + deliveryFee,
        status: 'confirmed',
        kitchen_status: 'pending',
        is_draft: false,
        order_type: orderType,
        customer_id: customerId,
        customer_name: linkedName || customer_name.trim(),
        customer_phone: linkedPhone || phoneNorm,
        delivery_zone: deliveryZoneName,
        delivery_address: deliveryAddress,
        delivery_fee: orderType === 'delivery' ? deliveryFee : null,
        estimated_delivery_time: orderType === 'delivery' && estimatedMinutes ? new Date(Date.now() + estimatedMinutes * 60000).toISOString() : null,
        created_at: now,
        updated_at: now,
        version: 1,
      }),
    });
    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return NextResponse.json({ error: `Order creation failed: ${errText}` }, { status: 500 });
    }
    const created = await insertRes.json();
    const orderId: string | undefined = created?.[0]?.id;
    if (!orderId) return NextResponse.json({ error: 'Order creation failed: no id returned' }, { status: 500 });

    const itemInserts = pricedItems.map((i: any) => ({
      order_id: orderId,
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
      // 11g (freeze audit): the compensating cancel's result was ignored —
      // a failed cancel left a CONFIRMED zero-item order dangling silently.
      const cancelRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${orderId}`, {
        method: 'PATCH', headers: s.headers,
        body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
      });
      if (!cancelRes.ok) {
        console.error('[online] CRITICAL: item insert failed AND rollback cancel failed — operator must cancel order', orderId, await cancelRes.text().catch(() => ''));
      }
      return NextResponse.json({ error: `Order items creation failed` }, { status: 500 });
    }

    // SSOT total when VAT applies (items-only; fee added back).
    let finalTotal = itemsTotal + deliveryFee;
    if (applyVat) {
      const ssotRes = await fetch(`${s.url}/rest/v1/rpc/calculate_order_total_v3`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_order_id: orderId, p_apply_vat: true, p_apply_service: false }),
      });
      if (ssotRes.ok) {
        const ssot = await ssotRes.json();
        finalTotal = (ssot?.total ?? itemsTotal) + deliveryFee;
        await fetch(`${s.url}/rest/v1/orders?id=eq.${orderId}`, {
          method: 'PATCH', headers: s.headers,
          body: JSON.stringify({ total_amount: finalTotal }),
        });
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      total: finalTotal,
      order_type: orderType,
      delivery_fee: deliveryFee,
      customer: customerId ? { id: customerId, linked: true } : null,
      trackingUrl: `/kitchen/track/${orderId}`,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
