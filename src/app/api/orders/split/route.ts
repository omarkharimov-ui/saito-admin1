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
    const { table_number } = await request.json();
    if (!table_number) {
      return NextResponse.json({ error: 'table_number required' }, { status: 400 });
    }

    // Find all non-paid orders on this table where merged_into IS NOT NULL
    // These are child orders of a merge group
    const childRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${table_number}&status=neq.paid&merged_into=not.is.null&select=id`,
      { headers }
    );
    if (!childRes.ok) {
      const errText = await childRes.text();
      return NextResponse.json({ error: `Fetch failed: ${errText}` }, { status: 500 });
    }
    const children: { id: string }[] = await childRes.json();

    if (children.length === 0) {
      return NextResponse.json({ error: 'No merged child orders found on this table' }, { status: 400 });
    }

    const childIds = children.map(c => c.id);

    // Delete child order_items
    for (const cid of childIds) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${cid}`,
        { headers, method: 'DELETE' }
      );
    }

    // Delete child orders
    for (const cid of childIds) {
      const delRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${cid}`,
        { headers, method: 'DELETE' }
      );
      if (!delRes.ok) {
        const errText = await delRes.text();
        console.error(`[Split] Failed to delete order ${cid}:`, errText);
      }
    }

    return NextResponse.json({ success: true, split_count: childIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
