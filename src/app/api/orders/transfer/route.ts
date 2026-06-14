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

    // Get all non-paid orders on source table (includes merged children)
    const sourceRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${from_table}&status=neq.paid&select=id,table_number,total_amount,guest_count,merged_into`,
      { headers }
    );
    if (!sourceRes.ok) {
      const err = await sourceRes.text();
      return NextResponse.json({ error: `Failed to fetch source orders: ${err}` }, { status: 500 });
    }
    const sourceOrdersAll = await sourceRes.json();
    if (!Array.isArray(sourceOrdersAll)) {
      return NextResponse.json({ error: 'Unexpected response fetching source orders' }, { status: 500 });
    }
    if (sourceOrdersAll.length === 0) {
      return NextResponse.json({ error: 'No active orders on source table' }, { status: 400 });
    }

    // Check if target table already has an active order (non-paid)
    const targetRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${to_table}&status=neq.paid&select=id,total_amount,guest_count`,
      { headers }
    );
    if (!targetRes.ok) {
      const err = await targetRes.text();
      return NextResponse.json({ error: `Failed to fetch target table orders: ${err}` }, { status: 500 });
    }
    const targetOrders = await targetRes.json();
    const hasTargetOrder = Array.isArray(targetOrders) && targetOrders.length > 0;

    // Move all orders to target table
    const movedIds: string[] = [];
    let extraTotal = 0;
    let extraGuests = 0;

    for (const o of sourceOrdersAll) {
      movedIds.push(o.id);
      extraTotal += Number(o.total_amount || 0);
      extraGuests += Number(o.guest_count || 0);

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${o.id}`,
        {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'PATCH',
          body: JSON.stringify({
            table_number: to_table,
            merged_into: null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Transfer failed for order ${o.id}: ${err}` }, { status: 500 });
      }
    }

    // Clear table-level merge link on source table (if it was a merged child)
    const clearMergeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${from_table}`,
      {
        headers: { ...headers, 'Prefer': 'return=minimal' },
        method: 'PATCH',
        body: JSON.stringify({ merged_into_table: null }),
      }
    );
    if (!clearMergeRes.ok) {
      const err = await clearMergeRes.text();
      console.error('Failed to clear merged_into_table on source table:', err);
      // non-fatal
    }

    // If target already has an order, merge totals into it
    if (hasTargetOrder && targetOrders[0]) {
      const primary = targetOrders[0];
      const mergeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${primary.id}`,
        {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'PATCH',
          body: JSON.stringify({
            total_amount: Number(primary.total_amount || 0) + extraTotal,
            guest_count: Number(primary.guest_count || 1) + extraGuests,
          }),
        }
      );
      if (!mergeRes.ok) {
        const err = await mergeRes.text();
        return NextResponse.json({ error: `Failed to merge totals into target order: ${err}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      moved_orders: movedIds.length,
      undo: { orderIds: movedIds, from_table, to_table },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
