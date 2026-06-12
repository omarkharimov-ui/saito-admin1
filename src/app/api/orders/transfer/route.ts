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

    // Get primary orders on source table
    const primaryRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${from_table}&status=neq.paid&select=id,table_number,total_amount,guest_count,merged_into`,
      { headers }
    );
    const primaryOrders = await primaryRes.json();
    let sourceOrders = primaryOrders || [];

    // Also find child orders (merged_into = one of the primary order IDs)
    const primaryIds = (primaryOrders || []).map((o: any) => o.id);
    if (primaryIds.length > 0) {
      const childFilter = primaryIds.map((id: string) => `merged_into.eq.${id}`).join(',');
      const childRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?or=(${childFilter})&status=neq.paid&select=id,table_number,total_amount,guest_count,merged_into`,
        { headers }
      );
      const childOrders = await childRes.json();
      if (childOrders?.length) {
        sourceOrders = [...sourceOrders, ...childOrders];
      }
    }

    if (sourceOrders.length === 0) {
      return NextResponse.json({ error: 'No active orders on source table' }, { status: 400 });
    }

    // Check if target table already has an active order (non-paid)
    const targetRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${to_table}&status=neq.paid&select=id,total_amount,guest_count`,
      { headers }
    );
    const targetOrders = await targetRes.json();
    const hasTargetOrder = targetOrders?.length > 0;

    // Move all orders to target table
    const movedIds: string[] = [];
    let extraTotal = 0;
    let extraGuests = 0;

    for (const o of sourceOrders) {
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
            kitchen_status: 'pending',
            is_rush: false,
            kitchen_accepted_at: null,
            // Clear merged_into so it's a primary order on the new table
            merged_into: null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Transfer failed for order ${o.id}: ${err}` }, { status: 500 });
      }
    }

    // If target already has an order, merge totals into it
    if (hasTargetOrder && targetOrders[0]) {
      const primary = targetOrders[0];
      await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${primary.id}`,
        {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'PATCH',
          body: JSON.stringify({
            total_amount: Number(primary.total_amount || 0) + extraTotal,
            guest_count: Number(primary.guest_count || 1) + extraGuests,
            kitchen_status: 'pending',
            is_rush: false,
            kitchen_accepted_at: null,
          }),
        }
      );
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
