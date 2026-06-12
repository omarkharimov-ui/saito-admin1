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
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*,products(image_url,name_az,name_en,name_ru,translations))&order=created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/order_items?select=*,products(image_url,name_az,name_en,name_ru,translations)`, { headers }),
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

// Sifariş yarat (order + order_items), güncəl, sil
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, data, id } = body;

    // ── Update / Delete ──
    if (action === 'update' || action === 'delete') {
      let url = `${SUPABASE_URL}/rest/v1/orders`;
      let method = 'PATCH';
      if (action === 'delete') method = 'DELETE';
      url += `?id=eq.${id}`;

      const res = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: action !== 'delete' ? JSON.stringify(data) : undefined,
      });
      const result = await res.json();
      return NextResponse.json(result);
    }

    // ── Create (POS-dan gələn sifariş) ──
    const { table_number, total_amount, status, order_type, guest_count, customer_note, items, source } = body;

    if (!table_number || !items?.length) {
      return NextResponse.json({ error: 'table_number and items required' }, { status: 400 });
    }

    // 1) Order yarat
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        table_number,
        total_amount: total_amount || items.reduce((s: number, i: any) => s + i.total_price, 0),
        status: status || 'confirmed',
        order_type: order_type || 'dine_in',
        guest_count: guest_count || 1,
        customer_note: customer_note || null,
        // source column does not exist in orders table
      }),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      return NextResponse.json({ error: `Order creation failed: ${errText}` }, { status: 500 });
    }

    const [newOrder] = await orderRes.json();
    if (!newOrder?.id) {
      return NextResponse.json({ error: 'Order created without ID' }, { status: 500 });
    }

    // 2) Order_items yarat
    const orderItems = items.map((item: any) => ({
      order_id: newOrder.id,
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      product_name: item.product_name || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price || (item.unit_price * item.quantity),
      modifiers: typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers || []),
      special_notes: item.special_notes || null,
    }));

    for (const oi of orderItems) {
      const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(oi),
      });
      if (!itemRes.ok) {
        const errText = await itemRes.text();
        console.error('[API /orders] Failed to create order_item:', errText);
      }
    }

    return NextResponse.json({ success: true, order: newOrder });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
