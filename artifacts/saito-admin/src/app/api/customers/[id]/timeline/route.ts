import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// W-A3 (2026-09-19, Wave A #2 backend): customer timeline — read-only
// aggregation of a customer's order/visit history (T1-T8, W_A3_PLAN.md).
//
// ACCESS: requireAuth (identical house pattern to /api/customers — no
// customers.view permission exists in the frozen P-1 registry; adding one is
// a separate ratified decision, FOLLOW-UP). READ-ONLY: the RPC is a pure
// SELECT aggregation; this route mutates nothing.
//
// All stats are computed live from orders (SSOT). customers.total_visits /
// total_spent / last_order_at are dead denormalized columns (no writer) and
// are deliberately not exposed (T2).
//
// SECURITY CHAIN (Rule 10): staff session -> requireAuth -> service_role
// client -> server-side fixed RPC (no client-composed SQL) -> no writes.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    // Next 15+: params is async (await required at runtime).
    const { id: idRaw } = await params;
    const id = String(idRaw || '');
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const res = await fetch(`${url}/rest/v1/rpc/get_customer_timeline`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_customer_id: id, p_limit: limit }),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Timeline lookup failed: ${t}` }, { status: 500 });
    }

    const row = await res.json();
    const data = Array.isArray(row) ? row[0] : row;
    // T6: unknown customer -> 404 (the RPC returns a null customer object).
    if (!data || !data.customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
