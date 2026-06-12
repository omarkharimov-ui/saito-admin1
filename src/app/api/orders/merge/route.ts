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
    const { table_numbers } = await request.json();

    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'At least 2 table numbers required' }, { status: 400 });
    }

    const targetTable = table_numbers[0];
    const restTables = table_numbers.slice(1);

    // Get source orders (from rest tables)
    const sourceFilter = restTables.map((t: number) => `table_number.eq.${t}`).join(',');
    const sourceOrdersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?or=(${sourceFilter})&status=neq.paid&select=id,table_number,total_amount,guest_count`,
      { headers }
    );
    const sourceOrders = await sourceOrdersRes.json();

    if (!sourceOrders?.length) {
      // All tables empty — nothing to merge, but not an error
      return NextResponse.json({ success: true, undo: null, message: 'no orders to merge' });
    }

    // Get primary target order
    const targetOrdersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&select=id,total_amount,guest_count`,
      { headers }
    );
    const targetOrders = await targetOrdersRes.json();
    const primaryOrder = targetOrders?.[0];

    let extraTotal = 0;

    if (primaryOrder) {
      // Move source orders to target table + mark as merged
      for (const src of sourceOrders) {
        extraTotal += Number(src.total_amount || 0);
        await fetch(
          `${SUPABASE_URL}/rest/v1/orders?id=eq.${src.id}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              table_number: targetTable,
              merged_into: primaryOrder.id,
            }),
          }
        );
      }

      // Update primary order total, reset kitchen status
      await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${primaryOrder.id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            total_amount: Number(primaryOrder.total_amount || 0) + extraTotal,
            guest_count: Number(primaryOrder.guest_count || 1) + sourceOrders.reduce((s: number, o: any) => s + Number(o.guest_count || 0), 0),
            kitchen_status: 'pending',
            is_rush: false,
            kitchen_accepted_at: null,
          }),
        }
      );
    } else {
      // No primary order exists — just move all source orders to target table
      for (const src of sourceOrders) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/orders?id=eq.${src.id}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ table_number: targetTable }),
          }
        );
      }
    }

    const undoData = {
      sourceOrders: sourceOrders.map((o: any) => ({ id: o.id, original_table: o.original_table || o.table_number })),
      targetTable,
    };
    return NextResponse.json({ success: true, undo: undoData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
