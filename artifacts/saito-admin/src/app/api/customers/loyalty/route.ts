import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 2026-09-26 (Task 53): loyalty point balances for the customer list —
// lightweight read-only companion to /api/customers/{id}/timeline (whose
// frozen RPC get_customer_timeline must not be edited per P-drift rule).
//
// GET /api/customers/loyalty?ids=<uuid>[,<uuid>...] (max 50)
// → { [customerId]: { points_balance, total_earned, total_redeemed } }
//
// SECURITY CHAIN (Rule 10, house pattern): staff session -> requireAuth ->
// service_role -> server-side fixed REST select on loyalty_accounts -> no
// writes. Customers without a loyalty account are simply absent from the
// map (client shows nothing).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const raw = new URL(request.url).searchParams.get('ids') || '';
    const ids = raw.split(',').map(s => s.trim()).filter(s => UUID_RE.test(s)).slice(0, 50);
    if (ids.length === 0) return NextResponse.json({});

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const list = ids.map(i => encodeURIComponent(i)).join(',');
    const res = await fetch(
      `${url}/rest/v1/loyalty_accounts?customer_id=in.(${list})&select=customer_id,points_balance,total_earned,total_redeemed`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: 'Loyalty lookup failed' }, { status: 500 });
    }
    const rows = await res.json();
    const out: Record<string, { points_balance: number; total_earned: number; total_redeemed: number }> = {};
    if (Array.isArray(rows)) {
      for (const r of rows) {
        out[r.customer_id] = {
          points_balance: Number(r.points_balance) || 0,
          total_earned: Number(r.total_earned) || 0,
          total_redeemed: Number(r.total_redeemed) || 0,
        };
      }
    }
    return NextResponse.json(out);
  } catch (error: any) {
    return NextResponse.json({ error: 'Loyalty lookup failed' }, { status: 500 });
  }
}
