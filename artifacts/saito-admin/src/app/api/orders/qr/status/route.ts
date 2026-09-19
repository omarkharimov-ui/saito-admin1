import { NextRequest, NextResponse } from 'next/server';

// W-A1 (delegated GO 2026-09-19): PUBLIC guest order-status read.
// Same access model as the G3 /api/orders/qr contract: table_number-identified +
// IP rate limited, location/org server-trusted from the table row, NO staff token.
// Exposes only the caller's own table order summary (no customer PII beyond a
// customer_linked boolean — never names/phones of other customers).
// Middleware: covered by the public '/api/orders/qr' prefix (see src/middleware.ts).

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 30; // generous: the menu page polls every 15s
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
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } };
}

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const table = Number(req.nextUrl.searchParams.get('table'));
    if (!Number.isInteger(table) || table < 1 || table > 100000) {
      return NextResponse.json({ error: 'table required' }, { status: 400 });
    }

    const s = svc();

    // Server-trusted table row (location/org follow from it — never the client).
    const tableRes = await fetch(
      `${s.url}/rest/v1/table_floors?table_number=eq.${encodeURIComponent(table)}&select=id,status,location_id,organization_id,current_order_id&limit=1`,
      { headers: s.headers }
    );
    const tableData = await tableRes.json();
    const tableRow = Array.isArray(tableData) && tableData[0];
    if (!tableRow) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Current order = the F-05-maintained pointer first, else the most recent
    // order for this exact table+location (covers the released-pointer case).
    let order: any = null;
    if (tableRow.current_order_id) {
      const oRes = await fetch(
        `${s.url}/rest/v1/orders?id=eq.${encodeURIComponent(tableRow.current_order_id)}&select=id,status,kitchen_status,total_amount,paid_amount,customer_id&limit=1`,
        { headers: s.headers }
      );
      order = (await oRes.json())[0] || null;
    }
    if (!order) {
      const oRes2 = await fetch(
        `${s.url}/rest/v1/orders?table_number=eq.${encodeURIComponent(table)}&location_id=eq.${encodeURIComponent(tableRow.location_id)}&select=id,status,kitchen_status,total_amount,paid_amount,customer_id&order=created_at.desc&limit=1`,
        { headers: s.headers }
      );
      order = (await oRes2.json())[0] || null;
    }
    if (!order) {
      return NextResponse.json({ success: true, has_order: false });
    }

    const itemsRes = await fetch(
      `${s.url}/rest/v1/order_items?order_id=eq.${encodeURIComponent(order.id)}&select=product_name,quantity&limit=50`,
      { headers: s.headers }
    );
    const items = (await itemsRes.json()) as any[];

    return NextResponse.json({
      success: true,
      has_order: true,
      order: {
        id: order.id,
        status: order.status,
        kitchen_status: order.kitchen_status,
        total: Number(order.paid_amount ?? order.total_amount ?? 0),
        item_count: (Array.isArray(items) ? items : []).reduce((n: number, i) => n + (i.quantity || 0), 0),
        items: Array.isArray(items) ? items.map(i => ({ name: i.product_name, quantity: i.quantity })) : [],
        customer_linked: !!order.customer_id,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
