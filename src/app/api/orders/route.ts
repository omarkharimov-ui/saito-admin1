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
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('[API /orders] Missing env vars:', { SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE_KEY: !!SERVICE_ROLE_KEY });
      return NextResponse.json({ error: 'Missing Supabase configuration. Restart the dev server after creating .env.local' }, { status: 500 });
    }

    const [ordersRes, itemsRes, tablesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*)&order=created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/order_items?select=*`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/settings?select=qr_table_count,opening_hours&limit=1`, { headers }),
    ]);

    if (!ordersRes.ok) {
      const errText = await ordersRes.text();
      console.error('[API /orders] ordersRes error:', ordersRes.status, errText);
      return NextResponse.json({ error: `orders fetch failed: ${ordersRes.status}` }, { status: 500 });
    }
    if (!itemsRes.ok) {
      const errText = await itemsRes.text();
      console.error('[API /orders] itemsRes error:', itemsRes.status, errText);
      return NextResponse.json({ error: `order_items fetch failed: ${itemsRes.status}` }, { status: 500 });
    }
    if (!tablesRes.ok) {
      const errText = await tablesRes.text();
      console.error('[API /orders] tablesRes error:', tablesRes.status, errText);
      return NextResponse.json({ error: `settings fetch failed: ${tablesRes.status}` }, { status: 500 });
    }

    const [orders, orderItems, settings] = await Promise.all([
      ordersRes.json(),
      itemsRes.json(),
      tablesRes.json(),
    ]);

    return NextResponse.json({
      orders: orders || [],
      orderItems: orderItems || [],
      tableCount: settings?.[0]?.qr_table_count ?? null,
      delayThreshold: 20,
      openingHours: settings?.[0]?.opening_hours || '09:00-23:00',
    });
  } catch (error: any) {
    console.error('[API /orders] Catch error:', error);
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
