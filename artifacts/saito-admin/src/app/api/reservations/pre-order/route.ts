import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const reservation_id = searchParams.get('reservation_id');

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const res = await fetch(
      `${svc().url}/rest/v1/reservations?select=pre_order_items,pre_order_total&id=eq.${reservation_id}`,
      { headers: svc().headers }
    );
    const data = await res.json();
    const reservation = data?.[0];

    return NextResponse.json({
      items: reservation?.pre_order_items || [],
      total: reservation?.pre_order_total || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { reservation_id, items } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const totalAmount = (items || []).reduce(
      (sum: number, item: any) => sum + (item.unit_price * item.quantity),
      0
    );

    await fetch(`${svc().url}/rest/v1/reservations?id=eq.${reservation_id}`, {
      method: 'PATCH',
      headers: svc().headers,
      body: JSON.stringify({
        pre_order_items: items ? JSON.stringify(items) : null,
        pre_order_total: totalAmount || null,
      }),
    });

    return NextResponse.json({ success: true, total: totalAmount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
