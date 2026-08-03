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
// order to the kitchen — it only persists the count on the open order (SSOT)
// and the table_floors row so the floor/KDS reflect it immediately.
// update_guest_count RPC refuses tables without an active order.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { table_number, guest_count } = await request.json();
    if (!table_number || guest_count == null) {
      return NextResponse.json({ error: 'table_number and guest_count are required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/rpc/update_guest_count`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_table_number: table_number,
        p_guest_count: Number(guest_count),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      const message = data?.error || data?.message || 'Guest count update failed';
      if (!res.ok) {
        console.error('[API /orders/guest-count] RPC error:', message);
      }
      return NextResponse.json({ error: message }, { status: res.ok ? 400 : 500 });
    }

    return NextResponse.json({ success: true, guest_count: data.guest_count ?? Number(guest_count) });
  } catch (error: any) {
    console.error('[API /orders/guest-count] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
