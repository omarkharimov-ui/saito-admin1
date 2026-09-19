import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, randomInt, createHash } from 'crypto';

// W-A2 D18 (2026-09-19, user decision): customer re-attach on a lost
// localStorage (different phone, cleared storage). The customer re-enters the
// 6-DIGIT CHECK CODE shown at order creation + the table number.
//
// SECURITY MODEL (same as D12, plus rotation):
//   - Only SHA-256 hashes are stored; the raw code is returned once at create
//     and is NEVER re-served (the tokenless /qr/status route cannot leak it).
//   - Brute force is infeasible: 10^6 space at 15/min per IP ≈ 46 days.
//   - ROTATION: the RPC consumes the presented code and installs the fresh
//     token+code pair — any intercepted/leaked old code dies with the relink.
//   - Wrong/absent code -> 404 "Check not found" (no existence leak).
//   - Finalized order (paid/closed/cancelled/refunded/voided) -> 409.
//
// Public guest channel, same access model as /api/orders/qr and /qr/add:
// table-identified + IP rate limited, no staff token.
//
// FOLLOW-UP (documented, not shipped): when the order carries a customer_phone,
// also require the matching phone on relink (raises the bar above a physical
// bystander who read the code on the same network).

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

const CODE_RE = /^[0-9]{6}$/;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const { table_number, check_code } = body;
    if (!table_number || !CODE_RE.test(String(check_code || ''))) {
      return NextResponse.json({ error: 'table_number and a 6-digit check code are required' }, { status: 400 });
    }

    const s = svc();
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');

    // The route mints the fresh pair; the RPC only stores the hashes after it
    // has verified the presented code under the row lock.
    const newToken = randomBytes(32).toString('hex');
    const newCode = String(randomInt(1000000)).padStart(6, '0');

    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/qr_relink_check`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_code_hash: sha(String(check_code)),
        p_table_number: Number(table_number),
        p_new_token_hash: sha(newToken),
        p_new_code_hash: sha(newCode),
      }),
    });

    if (!rpcRes.ok) {
      const t = await rpcRes.text();
      if (t.includes('QR_CHECK_CODE_INVALID')) {
        // 404 (not 403): no existence leak — wrong/absent code == no check.
        return NextResponse.json({ error: 'Check not found' }, { status: 404 });
      }
      if (t.includes('ORDER_FINALIZED')) {
        return NextResponse.json({ error: 'This check is closed' }, { status: 409 });
      }
      if (t.includes('QR_RELINK_BAD_ARGS')) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }
      return NextResponse.json({ error: `Relink failed: ${t}` }, { status: 500 });
    }

    const r = await rpcRes.json();
    const data = r?.[0] ?? r;
    // Raw credentials returned ONCE — the client overwrites its localStorage.
    return NextResponse.json({
      success: true,
      orderId: data.order_id,
      status: data.status,
      total: Number(data.total),
      checkToken: newToken,
      checkCode: newCode,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
