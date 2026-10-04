import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13d: service-role access to the `cancelled_orders` audit table.
// ROOT CAUSE (audit 13d-A): the table has a service-role-only policy, while
// the POS OrderModal (a) read the per-order cancel history and (b) INSERTED
// the audit row on partial cancel directly from the browser — the read was
// always empty and the INSERT was silently blocked by RLS → partial cancels
// lost their audit trail (the 13a-revived audit page could never see them).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const order_id = new URL(request.url).searchParams.get('order_id');
    if (!order_id) return NextResponse.json({ error: 'order_id is required' }, { status: 400 });

    const res = await fetch(
      `${url}/rest/v1/cancelled_orders?select=*&order_id=eq.${order_id}&order=created_at.desc&limit=100`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to load cancelled items' }, { status: 502 });
    return NextResponse.json(await res.json());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const body = await request.json();
    const { order_id, table_number, total_amount, reason, reason_text, items } = body;
    if (!order_id || !reason) {
      return NextResponse.json({ error: 'order_id and reason are required' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/cancelled_orders`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        order_id,
        table_number: table_number ?? null,
        total_amount: total_amount ?? null,
        reason,
        reason_text: reason_text || reason,
        items: items || [],
        created_at: new Date().toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data?.error || 'Cancelled-order record failed' }, { status: 500 });
    return NextResponse.json({ success: true, item: Array.isArray(data) ? data[0] : data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
