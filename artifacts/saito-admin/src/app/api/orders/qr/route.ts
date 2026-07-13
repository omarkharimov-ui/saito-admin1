import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { table_number, items, order_type = 'qr_order' } = body;

    if (!table_number || !items?.length) {
      return NextResponse.json({ error: 'table_number and items required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    const totalFromItems = items.reduce((s: number, i: any) => s + ((i.unit_price || 0) * (i.quantity || 1)), 0);

    const insertRes = await fetch(`${url}/rest/v1/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        table_number,
        total_amount: totalFromItems,
        status: 'confirmed',
        kitchen_status: 'pending',
        is_draft: false,
        order_type,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return NextResponse.json({ error: `Order creation failed: ${errText}` }, { status: 500 });
    }

    const created = await insertRes.json();
    const activeOrderId = created?.[0]?.id;
    if (!activeOrderId) return NextResponse.json({ error: 'Order creation failed: no id returned' }, { status: 500 });

    const itemInserts = items.map((i: any) => ({
      order_id: activeOrderId,
      product_id: i.product_id,
      product_name: i.product_name || '',
      quantity: i.quantity || 1,
      unit_price: i.unit_price || 0,
      total_price: (i.unit_price || 0) * (i.quantity || 1),
      kitchen_status: 'pending',
    }));

    const itemsRes = await fetch(`${url}/rest/v1/order_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify(itemInserts),
    });

    if (!itemsRes.ok) {
      const errText = await itemsRes.text();
      return NextResponse.json({ error: `Order items creation failed: ${errText}` }, { status: 500 });
    }

    await fetch(`${url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'occupied', total_amount: totalFromItems, last_activity_at: new Date().toISOString() }),
    });

    return NextResponse.json({ success: true, orderId: activeOrderId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
