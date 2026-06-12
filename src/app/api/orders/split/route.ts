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

    // Find child orders (merged_into IS NOT NULL) on this table
    const childRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${table_number}&status=neq.paid&merged_into=not.is.null&select=id,table_number,total_amount,merged_into`,
      { headers }
    );
    if (!childRes.ok) {
      const errText = await childRes.text();
      return NextResponse.json({ error: `Fetch failed: ${errText}` }, { status: 500 });
    }
    const children: { id: string; table_number: number; total_amount: number; merged_into: string }[] = await childRes.json();
    if (!children.length) {
      return NextResponse.json({ error: 'No merged child orders found on this table' }, { status: 400 });
    }

    // Get primary order
    const parentId = children[0].merged_into;
    const parentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}&select=id,total_amount,guest_count`,
      { headers }
    );
    const [parentOrder] = await parentRes.json();

    // Find next available empty table numbers
    const allTablesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/table_floors?select=table_number&order=table_number.asc`,
      { headers }
    );
    const allTables: { table_number: number }[] = await allTablesRes.json();

    const occupiedRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?select=table_number&status=neq.paid`,
      { headers }
    );
    const occupiedOrders: { table_number: number }[] = await occupiedRes.json();
    const occupiedSet = new Set(occupiedOrders.map(o => o.table_number));

    const emptyTables = allTables.filter(t => !occupiedSet.has(t.table_number)).map(t => t.table_number);

    // Move each child to the next empty table, clear merged_into
    let moved = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const newTable = emptyTables[i];
      if (!newTable) continue;

      await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${child.id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            table_number: newTable,
            merged_into: null,
          }),
        }
      );
      moved++;
    }

    // Recalculate primary order total and guest count (subtract moved orders)
    if (parentOrder) {
      const childTotal = children.reduce((s, c) => s + Number(c.total_amount || 0), 0);
      const newTotal = Math.max(0, Number(parentOrder.total_amount || 0) - childTotal);
      await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ total_amount: newTotal }),
        }
      );
    }

    const undoData = {
      childOrderIds: children.map(c => c.id),
      parentId,
      originalTable: table_number,
      childTables: children.map((c, i) => ({ id: c.id, newTable: emptyTables[i] })),
    };
    return NextResponse.json({ success: true, split_count: moved, undo: undoData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
