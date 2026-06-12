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
    const { action, data } = await request.json();

    if (!action || !data) {
      return NextResponse.json({ error: 'action and data required' }, { status: 400 });
    }

    switch (action) {
      case 'merge': {
        // data: { sourceOrders, targetTable }
        // Undo merge: clear merged_into on source orders, recalc parent total
        const { sourceOrders, targetTable } = data;
        if (!sourceOrders?.length) {
          return NextResponse.json({ error: 'No source orders to undo' }, { status: 400 });
        }
        // Find parent order on target table to update its total
        const parentRes = await fetch(
          `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&select=id,total_amount`,
          { headers }
        );
        const parentOrders = await parentRes.json();
        const parentOrder = Array.isArray(parentOrders) ? parentOrders[0] : null;

        for (const src of sourceOrders) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/orders?id=eq.${src.id}`,
            {
              method: 'PATCH',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ merged_into: null }),
            }
          );
        }

        // Subtract child totals from parent
        if (parentOrder) {
          const childTotal = sourceOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
          const newTotal = Math.max(0, Number(parentOrder.total_amount || 0) - childTotal);
          await fetch(
            `${SUPABASE_URL}/rest/v1/orders?id=eq.${parentOrder.id}`,
            {
              method: 'PATCH',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ total_amount: newTotal }),
            }
          );
        }

        return NextResponse.json({ success: true });
      }

      case 'split': {
        // data: { childOrderIds, parentId, originalTable, childTables }
        // Undo split: move children back to parent table, set merged_into
        const { childOrderIds, parentId, originalTable } = data;
        if (!childOrderIds?.length || !parentId) {
          return NextResponse.json({ error: 'Invalid undo data' }, { status: 400 });
        }
        for (const cid of childOrderIds) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/orders?id=eq.${cid}`,
            {
              method: 'PATCH',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                table_number: originalTable,
                merged_into: parentId,
              }),
            }
          );
        }
        // Recalculate parent total
        const ordersRes = await fetch(
          `${SUPABASE_URL}/rest/v1/orders?or=(${[parentId, ...childOrderIds].map(id => `id.eq.${id}`).join(',')})&select=id,total_amount`,
          { headers }
        );
        const orders = await ordersRes.json();
        const total = orders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
        await fetch(
          `${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ total_amount: total }),
          }
        );
        return NextResponse.json({ success: true });
      }

      case 'transfer': {
        // data: { orderIds, fromTable, toTable }
        // Undo transfer: move orders back to fromTable
        const { orderIds, fromTable } = data;
        if (!orderIds?.length) {
          return NextResponse.json({ error: 'No orders to undo' }, { status: 400 });
        }
        for (const oid of orderIds) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}`,
            {
              method: 'PATCH',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ table_number: fromTable }),
            }
          );
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
