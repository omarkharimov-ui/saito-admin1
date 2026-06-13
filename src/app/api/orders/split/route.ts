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

    // Find primary order on this table (no merged_into set)
    const parentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${table_number}&status=neq.paid&merged_into=is.null&select=id,total_amount,guest_count`,
      { headers }
    );
    if (!parentRes.ok) {
      const errText = await parentRes.text();
      return NextResponse.json({ error: `Fetch failed: ${errText}` }, { status: 500 });
    }
    const parentOrders: { id: string; total_amount: number; guest_count: number }[] = await parentRes.json();
    const primaryOrder = parentOrders?.[0];

    // Find child orders (merged_into = primary order id) across all tables
    let children: { id: string; table_number: number; total_amount: number; merged_into: string }[] = [];
    if (primaryOrder) {
      const childRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?merged_into=eq.${primaryOrder.id}&status=neq.paid&select=id,table_number,total_amount,merged_into`,
        { headers }
      );
      if (childRes.ok) {
        children = await childRes.json();
      }
    }

    // Also find table-level merged children
    const mergedTablesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/table_floors?merged_into_table=eq.${table_number}&select=table_number`,
      { headers }
    );
    const mergedTables: { table_number: number }[] = mergedTablesRes.ok ? await mergedTablesRes.json() : [];
    const mergedTableNums = new Set(mergedTables.map(t => t.table_number));

    if (!children.length && mergedTableNums.size === 0) {
      return NextResponse.json({ error: 'No merged tables found to split' }, { status: 400 });
    }

    // Unmerge orders — just clear merged_into, don't move tables
    for (const child of children) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${child.id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ merged_into: null }),
        }
      );
    }

    // Clear table-level merged_into_table on child table_floors
    for (const tableNum of mergedTableNums) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${tableNum}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ merged_into_table: null }),
        }
      );
    }

    // Recalculate primary order total (subtract moved orders)
    if (primaryOrder) {
      const childTotal = children.reduce((s, c) => s + Number(c.total_amount || 0), 0);
      const newTotal = Math.max(0, Number(primaryOrder.total_amount || 0) - childTotal);
      await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${primaryOrder.id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ total_amount: newTotal }),
        }
      );
    }

    const unmergedCount = children.length + mergedTableNums.size;
    return NextResponse.json({ success: true, split_count: unmergedCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
