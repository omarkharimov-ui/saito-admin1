import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

// Bütün sifarişləri gətir
export async function GET() {
  try {
    const [ordersRes, itemsRes, tablesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*)&order=created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/order_items?select=*`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/settings?select=qr_table_count,opening_hours,delay_threshold&limit=1`, { headers }),
    ]);

    const [orders, orderItems, settings] = await Promise.all([
      ordersRes.json(),
      itemsRes.json(),
      tablesRes.json(),
    ]);

    return NextResponse.json({
      orders: orders || [],
      orderItems: orderItems || [],
      tableCount: settings?.[0]?.qr_table_count ?? null,
      delayThreshold: settings?.[0]?.delay_threshold || 20,
      openingHours: settings?.[0]?.opening_hours || '09:00-23:00',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Sifariş yarat/güncələ/sil
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, data, id } = body;

    let url = `${SUPABASE_URL}/rest/v1/orders`;
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
