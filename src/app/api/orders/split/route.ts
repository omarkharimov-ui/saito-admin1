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

    // Find primary order on this table first
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
    if (!primaryOrder) {
      return NextResponse.json({ error: 'No primary order found on this table' }, { status: 400 });
    }

    // Find child orders (merged_into = primary order id) across all tables
    const childRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?merged_into=eq.${primaryOrder.id}&status=neq.paid&select=id,table_number,total_amount,merged_into`,
      { headers }
    );
    if (!childRes.ok) {
      const errText = await childRes.text();
      return NextResponse.json({ error: `Fetch failed: ${errText}` }, { status: 500 });
    }
    const children: { id: string; table_number: number; total_amount: number; merged_into: string }[] = await childRes.json();
    if (!children.length) {
      return NextResponse.json({ error: 'No merged child orders found' }, { status: 400 });
    }

    const parentId = primaryOrder.id;
    const parentTotal = Number(primaryOrder.total_amount || 0);

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

      // Also clear table-level merged_into_table on the child's original table
      await fetch(
        `${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${child.table_number}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ merged_into_table: null }),
        }
      );

      moved++;
    }

    // Recalculate primary order total (subtract moved orders)
    const childTotal = children.reduce((s, c) => s + Number(c.total_amount || 0), 0);
    const newTotal = Math.max(0, parentTotal - childTotal);
    await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ total_amount: newTotal }),
      }
    );

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
