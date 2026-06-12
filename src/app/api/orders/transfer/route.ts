import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export async function POST(request: NextRequest) {
  try {
    const { from_table, to_table } = await request.json();

    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    // Get all non-paid orders from source table
    const ordersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${from_table}&status=neq.paid`,
      { headers }
    );
    const orders = await ordersRes.json();

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'No active orders on source table' }, { status: 400 });
    }

    // Move each order to target table
    const orderIds = orders.map((o: any) => o.id);
    for (const id of orderIds) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`,
        {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'PATCH',
          body: JSON.stringify({ table_number: to_table }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Transfer failed for order ${id}: ${err}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      moved_orders: orderIds.length,
      undo: { orderIds, from_table, to_table },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
