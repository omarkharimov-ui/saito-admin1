import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

export async function GET() {
  try {
    const [reservationsRes, ordersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/reservations?select=*&order=date.desc,time.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=table_number,status&status=in.(new,confirmed,paid)`, { headers }),
    ]);

    const [reservations, orders] = await Promise.all([
      reservationsRes.json(),
      ordersRes.json(),
    ]);

    return NextResponse.json({
      reservations: reservations || [],
      orders: orders || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, data, id } = body;

    let url = `${SUPABASE_URL}/rest/v1/reservations`;
    let method = 'POST';
    
    if (action === 'update') {
      url += `?id=eq.${id}`;
      method = 'PATCH';
    } else if (action === 'delete') {
      url += `?id=eq.${id}`;
      method = 'DELETE';
    }

    const res = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: action !== 'delete' ? JSON.stringify(data) : undefined,
    });

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
