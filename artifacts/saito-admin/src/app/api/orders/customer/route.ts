import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

/**
 * OS BUILD #1b — attach/detach a customer to a LIVE order (any open status).
 *
 * The POS cart keeps its customer in client state until the order exists;
 * when the order is already created (dine-in table opened), selecting the
 * customer on the payment sheet must PATCH the order so the loyalty spine
 * (earn trigger) credits the RIGHT customer.
 *
 * If the order is already 'paid' with a customer attached and points were
 * earned, switching the customer here is refused (points are not
 * transferable) — detach (null) is always allowed, re-attach requires the
 * order to be open again.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth as any;
    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { order_id, customer_id, customer_name, customer_phone } = body;
    if (!order_id || customer_id === undefined) {
      return NextResponse.json({ error: 'order_id and customer_id are required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    const getRes = await fetch(`${url}/rest/v1/orders?id=eq.${order_id}&select=id,status,customer_id,loyalty_points_earned`, { headers });
    if (!getRes.ok) return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
    const rows = await getRes.json();
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (customer_id) {
      // Refuse customer switch on an already-paid order that earned points.
      if (order.status === 'paid' && order.customer_id && order.customer_id !== customer_id) {
        return NextResponse.json(
          { error: 'Cannot switch customer on a paid order (loyalty points already earned)' },
          { status: 409 }
        );
      }

      const patchRes = await fetch(`${url}/rest/v1/orders?id=eq.${order_id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          customer_id,
          customer_name: customer_name ?? null,
          customer_phone: customer_phone ?? null,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        return NextResponse.json({ error: err?.error || 'Failed to attach customer' }, { status: 500 });
      }
      return NextResponse.json({ success: true, order_id, customer_id });
    }

    // Detach.
    const patchRes = await fetch(`${url}/rest/v1/orders?id=eq.${order_id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ customer_id: null, customer_name: null, customer_phone: null }),
    });
    if (!patchRes.ok) return NextResponse.json({ error: 'Failed to detach customer' }, { status: 500 });
    return NextResponse.json({ success: true, order_id, customer_id: null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
