import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// Remove unsent (draft) order items from the cart. Triggered by the CartPanel
// "clear" button — drops only items that were never sent to the kitchen.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { item_ids } = await request.json();
    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return NextResponse.json({ success: true, removed: 0 });
    }

    const s = svc();
    const ids = item_ids.map((id: string) => `"${id}"`).join(',');

    const delRes = await fetch(`${s.url}/rest/v1/order_items?id=in.(${ids})&kitchen_status=in.(pending,reserved)`, {
      method: 'DELETE',
      headers: s.headers,
    });

    if (!delRes.ok) {
      const err = await delRes.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json({ success: true, removed: item_ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
