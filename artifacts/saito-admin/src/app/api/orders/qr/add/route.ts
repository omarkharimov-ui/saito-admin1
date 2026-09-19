import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'crypto';

// W-A2 (2026-09-19): PUBLIC guest add-to-check — the customer adds items to the
// ACTIVE order on their table, authorized by the one-time check_token minted in
// the G3 create response (D12). Same public access model as /api/orders/qr:
// table-identified + IP rate-limited, server-trusted everything else. No staff
// token. The check_token (hashed server-side) is what prevents a bystander who
// knows the table number from loading someone else's check.
//
// Security chain (Rule 10): UI (token in localStorage) → this route (shape +
// rate limit) → qr_add_items RPC (FOR UPDATE on the order row, finalized
// re-check, server-sourced price, idempotency, SSOT total) → order_items
// triggers (kitchen/outbox, path-agnostic) → idx_orders_active_table (no 2nd
// order is ever created).

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 15;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const { table_number, check_token, items } = body;
    if (!table_number || typeof check_token !== 'string' || !check_token || !Array.isArray(items) || items.length === 0 || items.length > 20) {
      return NextResponse.json({ error: 'table_number, check_token and 1..20 items required' }, { status: 400 });
    }
    // Shape-validate before the RPC (bad uuid casts must not reach the function).
    for (const i of items) {
      const pid = String(i?.product_id || '');
      if (!UUID_RE.test(pid)) {
        return NextResponse.json({ error: 'Each item needs a valid product_id' }, { status: 400 });
      }
      const q = Number(i?.quantity ?? 1);
      if (!Number.isInteger(q) || q < 1 || q > 99) {
        return NextResponse.json({ error: 'quantity must be an integer 1..99' }, { status: 400 });
      }
    }

    const s = svc();
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/qr_add_items`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_token_hash: createHash('sha256').update(check_token).digest('hex'),
        p_table_number: Number(table_number),
        p_items: items.map((i: any) => ({ product_id: i.product_id, quantity: Number(i.quantity ?? 1) })),
        p_idempotency_key: typeof body.idempotency_key === 'string' && body.idempotency_key
          ? body.idempotency_key
          : randomUUID(),
      }),
    });

    if (!rpcRes.ok) {
      const t = await rpcRes.text();
      if (t.includes('QR_CHECK_TOKEN_INVALID')) {
        // 404 (not 403): no existence leak — wrong/absent token == no check.
        return NextResponse.json({ error: 'Check not found' }, { status: 404 });
      }
      if (t.includes('ORDER_FINALIZED')) {
        return NextResponse.json({ error: 'This check is closed' }, { status: 409 });
      }
      if (t.includes('PRODUCT_NOT_FOUND') || t.includes('INVALID_QTY') || t.includes('QR_ADD_BAD_ARGS')) {
        return NextResponse.json({ error: 'Item rejected' }, { status: 400 });
      }
      return NextResponse.json({ error: `Add failed: ${t}` }, { status: 500 });
    }

    const r = await rpcRes.json();
    const data = r?.[0] ?? r;
    return NextResponse.json({
      success: true,
      orderId: data.order_id,
      status: data.status,
      itemsAdded: data.items_added,
      total: Number(data.total),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
