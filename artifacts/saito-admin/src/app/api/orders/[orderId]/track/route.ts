import { NextRequest, NextResponse } from 'next/server';

/**
 * PUBLIC customer tracking endpoint — feeds /kitchen/track/[orderId] (10s poll).
 * Order id is an unguessable UUID (the customer holds the link from the
 * confirmation screen), so no staff auth is required — same trust model as the
 * QR check code flow.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) throw new Error('Missing Supabase configuration');
    const H = { apikey: key, Authorization: `Bearer ${key}` };

    const orderRes = await fetch(
      `${url}/rest/v1/orders?id=eq.${orderId}&select=id,table_number,order_type,kitchen_status,kitchen_accepted_at,kitchen_ready_at,created_at,total_amount,status`,
      { headers: H }
    );
    if (!orderRes.ok) return NextResponse.json({ error: 'Order lookup failed' }, { status: 500 });
    const orderRows = await orderRes.json();
    const order = Array.isArray(orderRows) ? orderRows[0] : null;
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const itemsRes = await fetch(
      `${url}/rest/v1/order_items?order_id=eq.${orderId}&select=id,product_id,product_name,quantity,prepared_quantity,kitchen_status`,
      { headers: H }
    );
    const items = (itemsRes.ok ? await itemsRes.json() : []) as any[];

    // Image enrichment (order_items has no image_url; products does).
    const pids = Array.from(new Set(items.map(i => i.product_id).filter(Boolean)));
    if (pids.length > 0) {
      const prodRes = await fetch(
        `${url}/rest/v1/products?id=in.(${pids.map(p => `"${p}"`).join(',')})&select=id,image_url`,
        { headers: H }
      );
      if (prodRes.ok) {
        const prods = (await prodRes.json()) as any[];
        const imgMap = new Map(prods.map(p => [p.id, p.image_url]));
        for (const it of items) it.image_url = imgMap.get(it.product_id) || null;
      }
    }

    return NextResponse.json({
      id: order.id,
      table_number: order.table_number ?? null,
      order_type: order.order_type || 'dine_in',
      kitchen_status: order.kitchen_status,
      kitchen_accepted_at: order.kitchen_accepted_at,
      kitchen_ready_at: order.kitchen_ready_at,
      created_at: order.created_at,
      total_amount: order.total_amount,
      status: order.status,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
