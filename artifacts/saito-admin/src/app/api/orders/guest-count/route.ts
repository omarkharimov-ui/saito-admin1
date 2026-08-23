import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// Independent guest-count update. Changing the guest count must NOT send the
// order to the kitchen — it only persists the count on the open order and the
// table_floors row so the floor/KDS reflect it immediately.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { table_number, guest_count } = await request.json();
    if (!table_number || guest_count == null) {
      return NextResponse.json({ error: 'table_number and guest_count are required' }, { status: 400 });
    }

    const count = Number(guest_count);
    if (!Number.isInteger(count) || count < 1) {
      return NextResponse.json({ error: 'Guest count must be at least 1' }, { status: 400 });
    }

    const s = svc();

    const ordersRes = await fetch(
      `${s.url}/rest/v1/orders?table_number=eq.${table_number}&status=not.in.(paid,cancelled,closed)&select=id,guest_count`,
      { headers: s.headers }
    );
    const orders = await ordersRes.json();

    if (Array.isArray(orders) && orders.length > 0) {
      for (const o of orders) {
        const patchRes = await fetch(`${s.url}/rest/v1/orders?id=eq.${o.id}`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ guest_count: count }),
        });
        if (!patchRes.ok) {
          const errText = await patchRes.text().catch(() => 'Unknown error');
          return NextResponse.json({ error: `Failed to update order ${o.id}: ${patchRes.status} ${errText}` }, { status: 500 });
        }
      }
    }

    const tablePatchRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ guest_count: count }),
    });
    if (!tablePatchRes.ok) {
      const errText = await tablePatchRes.text().catch(() => 'Unknown error');
      return NextResponse.json({ error: `Failed to update table_floors: ${tablePatchRes.status} ${errText}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, guest_count: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
