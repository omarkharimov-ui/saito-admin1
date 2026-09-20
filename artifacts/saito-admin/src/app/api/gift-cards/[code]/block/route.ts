import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// GC (Wave A #3, 2026-09-20): gift card lifecycle control — block / unblock.
// Ratified D3 (2026-09-20): block stops use (balance preserved); unblock
// restores active (or 'expired' when past expiry). Cancel is NOT a v1
// operation — the engine defines no cancel semantics.
// ACCESS: requireAuth + role allowlist (house direct-role pattern, cf.
// /api/orders). Body: { unblock?: boolean, reason?: string }.
// SECURITY CHAIN (Rule 10): staff session -> requireAuth -> role gate ->
// service_role key -> gift_card_block() RPC (FOR UPDATE atomic, log_audit
// old->new status, balance never mutated).

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
    const unblock = !!body.unblock;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const res = await fetch(`${url}/rest/v1/rpc/gift_card_block`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_code: code,
        p_unblock: unblock,
        p_reason: reason,
        p_performed_by: auth.user?.id || null,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Block operation failed: ${t}` }, { status: 500 });
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
