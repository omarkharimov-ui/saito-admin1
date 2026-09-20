import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// GC 1.5 (2026-09-20, map §8 "refund to card"): money returned TO the card.
// 'active' and 'used' cards accepted (used card resurrects to active —
// that IS the point of a card refund); blocked/expired rejected.
// Body: { amount: number, reason?: string }.
// SECURITY CHAIN (Rule 10): staff session -> requireAuth -> GC role gate ->
// service_role key -> gift_card_refund() RPC (FOR UPDATE atomic, ledger
// 'refund' entry, log_audit, balance invariant preserved).

const CODE_RE = /^[A-Z0-9][A-Z0-9 _\-]{2,31}$/i;
const GC_ROLES = ['admin', 'manager', 'superadmin', 'owner'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!GC_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Next 15+: params is async (await required at runtime).
    const { code: codeRaw } = await params;
    const code = String(codeRaw || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      return NextResponse.json({ error: 'Invalid card code' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const res = await fetch(`${url}/rest/v1/rpc/gift_card_refund`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_code: code,
        p_amount: amount,
        p_reason: reason,
        p_performed_by: auth.user?.id || null,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Refund operation failed: ${t}` }, { status: 500 });
    }

    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) {
      return NextResponse.json(row, { status: 400 });
    }
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
