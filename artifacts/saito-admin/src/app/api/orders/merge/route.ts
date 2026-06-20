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
    const sourceUrl = restTables.length === 1
      ? `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${restTables[0]}&status=neq.paid&select=id,table_number,total_amount,guest_count`
      : `${SUPABASE_URL}/rest/v1/orders?or=(${sourceFilter})&status=neq.paid&select=id,table_number,total_amount,guest_count`;
    const sourceOrdersRes = await fetch(sourceUrl, { headers });
    if (!sourceOrdersRes.ok) {
      const err = await sourceOrdersRes.text();
      return NextResponse.json({ error: `Failed to fetch source orders: ${err}` }, { status: 500 });
    }
    const sourceOrders = await sourceOrdersRes.json();
    if (!Array.isArray(sourceOrders)) {
      return NextResponse.json({ error: 'Unexpected response fetching source orders' }, { status: 500 });
    }

    // Determine the real parent table after merge
    let parentTableNumber = targetTable;
    let primaryOrder: any = null;

    // Check if target has a primary order
    const targetOrdersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&select=id,total_amount,guest_count`,
      { headers }
    );
    if (!targetOrdersRes.ok) {
      const err = await targetOrdersRes.text();
      return NextResponse.json({ error: `Failed to fetch target order: ${err}` }, { status: 500 });
    }
    const targetOrdersData = await targetOrdersRes.json();
    const targetOrders = Array.isArray(targetOrdersData) ? targetOrdersData : [];
    primaryOrder = targetOrders[0];

    // If target has no orders but source tables have orders, the real parent is the source table with the primary order
    let primaryStaysOnSourceTable: number | null = null;
    if (!primaryOrder && sourceOrders.length > 0) {
      primaryStaysOnSourceTable = sourceOrders[0].table_number; // first source order becomes new primary
    }

    let extraTotal = 0;
    let extraGuests = 0;

    if (sourceOrders.length > 0) {
      if (primaryOrder) {
        // Mark source orders as merged (don't move table_number)
        for (const src of sourceOrders) {
          extraTotal += Number(src.total_amount || 0);
          extraGuests += Number(src.guest_count || 0);
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/orders?id=eq.${src.id}`,
            {
              method: 'PATCH',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ merged_into: primaryOrder.id }),
            }
          );
          if (!patchRes.ok) {
            const err = await patchRes.text();
            return NextResponse.json({ error: `Failed to merge order ${src.id}: ${err}` }, { status: 500 });
          }
        }

        // Update primary order total
        const primaryPatchRes = await fetch(
          `${SUPABASE_URL}/rest/v1/orders?id=eq.${primaryOrder.id}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              total_amount: Number(primaryOrder.total_amount || 0) + extraTotal,
              guest_count: Number(primaryOrder.guest_count || 1) + extraGuests,
              kitchen_status: 'pending',
              is_rush: false,
              kitchen_accepted_at: null,
            }),
          }
        );
        if (!primaryPatchRes.ok) {
          const err = await primaryPatchRes.text();
          return NextResponse.json({ error: `Failed to update primary order: ${err}` }, { status: 500 });
        }
      } else {
        // No primary order on target — make first source order the primary, mark rest as merged
        const newPrimary = sourceOrders[0];
        for (let i = 1; i < sourceOrders.length; i++) {
          const src = sourceOrders[i];
          extraTotal += Number(src.total_amount || 0);
          extraGuests += Number(src.guest_count || 0);
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/orders?id=eq.${src.id}`,
            {
              method: 'PATCH',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ merged_into: newPrimary.id }),
            }
          );
          if (!patchRes.ok) {
            const err = await patchRes.text();
            return NextResponse.json({ error: `Failed to merge order ${src.id}: ${err}` }, { status: 500 });
          }
        }

        // Update new primary order total
        const primaryPatchRes = await fetch(
          `${SUPABASE_URL}/rest/v1/orders?id=eq.${newPrimary.id}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              total_amount: Number(newPrimary.total_amount || 0) + extraTotal,
              guest_count: Number(newPrimary.guest_count || 1) + extraGuests,
              kitchen_status: 'pending',
              is_rush: false,
              kitchen_accepted_at: null,
            }),
          }
        );
        if (!primaryPatchRes.ok) {
          const err = await primaryPatchRes.text();
          return NextResponse.json({ error: `Failed to update primary order: ${err}` }, { status: 500 });
        }
      }
    }

    // After order merge, set merged_into_table on ALL source table_floors
    // This ensures empty source tables also show as merged
    const sourceTableNumbers = restTables as number[];
    for (const tableNum of sourceTableNumbers) {
      // Set merged_into_table on source table → points to the real parent table
      const realParent = primaryStaysOnSourceTable ?? parentTableNumber;
      await fetch(
        `${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${tableNum}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ merged_into_table: realParent }),
        }
      );
    }

    const undoData = {
      sourceOrders: sourceOrders.map((o: any) => ({ id: o.id, original_table: o.table_number, total_amount: o.total_amount })),
      sourceTableNumbers,
      targetTable,
    };
    return NextResponse.json({ success: true, undo: undoData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
