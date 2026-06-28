import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) return NextResponse.json({ error: 'Table number required' }, { status: 400 });

    const s = svc();

    const ordersRes = await fetch(`${s.url}/rest/v1/orders?select=id&table_number=eq.${table_number}&status=neq.paid&status=neq.cancelled`, { headers: s.headers });
    if (!ordersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
    const orders: { id: string }[] = await ordersRes.json();

    if (Array.isArray(orders) && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const cancelRes = await fetch(`${s.url}/rest/v1/orders?id=in.(${orderIds.join(',')})`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        }),
      });
      if (!cancelRes.ok) {
        return NextResponse.json({ error: 'Failed to cancel orders' }, { status: 500 });
      }
    }

    const tableRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'empty',
        reservation_id: null,
        reservation_name: null,
        reservation_phone: null,
        reservation_time: null,
        guest_count: null,
        merged_into_table: null
      }),
    });
    if (!tableRes.ok) {
      return NextResponse.json({ error: 'Failed to update table' }, { status: 500 });
    }

    return NextResponse.json({ success: true, table_number, status: 'empty' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

