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

    // Get target orders and their items
    const targetFilter = restTables.map((t: number) => `table_number.eq.${t}`).join(',');
    const sourceOrdersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?or=(${targetFilter})&status=neq.paid&select=id,total_amount,order_items(id,product_id,quantity,unit_price,total_price,prepared_quantity)`,
      { headers }
    );
    const sourceOrders = await sourceOrdersRes.json();

    // Get primary target order
    const targetOrdersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&select=id,total_amount,order_items(id,product_id,quantity,unit_price,total_price)`,
      { headers }
    );
    const targetOrders = await targetOrdersRes.json();
    const primaryOrder = targetOrders?.[0];

    let extraTotal = 0;
    let targetItemIds: string[] = [];

    if (primaryOrder) {
      targetItemIds = (primaryOrder.order_items || []).map((i: any) => i.id);

      // For each source order, merge items into the primary order
      for (const srcOrder of sourceOrders) {
        extraTotal += Number(srcOrder.total_amount || 0);
        const items = srcOrder.order_items || [];
        for (const item of items) {
          // Check if same product exists in target
          const existing = (primaryOrder.order_items || []).find(
            (ti: any) => ti.product_id === item.product_id
          );
          if (existing) {
            const newQty = existing.quantity + item.quantity;
            // Update existing item quantity and total_price
            await fetch(
              `${SUPABASE_URL}/rest/v1/order_items?id=eq.${existing.id}`,
              {
                headers: { ...headers, 'Prefer': 'return=minimal' },
                method: 'PATCH',
                body: JSON.stringify({
                  quantity: newQty,
                  total_price: existing.unit_price * newQty,
                }),
              }
            );
            // Delete the source item
            await fetch(
              `${SUPABASE_URL}/rest/v1/order_items?id=eq.${item.id}`,
              { headers, method: 'DELETE' }
            );
          } else {
            // Re-parent source item to primary order
            await fetch(
              `${SUPABASE_URL}/rest/v1/order_items?id=eq.${item.id}`,
              {
                headers: { ...headers, 'Prefer': 'return=minimal' },
                method: 'PATCH',
                body: JSON.stringify({ order_id: primaryOrder.id }),
              }
            );
          }
        }

        // Mark source order as merged
        await fetch(
          `${SUPABASE_URL}/rest/v1/orders?id=eq.${srcOrder.id}`,
          {
            headers: { ...headers, 'Prefer': 'return=minimal' },
            method: 'PATCH',
            body: JSON.stringify({
              table_number: targetTable,
              merged_into: primaryOrder.id,
              kitchen_status: null,
              is_served: true,
            }),
          }
        );
      }

      // Update primary order total and reset kitchen
      const newTotal = Number(primaryOrder.total_amount || 0) + extraTotal;
      await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${primaryOrder.id}`,
        {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'PATCH',
          body: JSON.stringify({
            total_amount: newTotal,
            kitchen_status: 'pending',
            is_rush: false,
            kitchen_accepted_at: null,
          }),
        }
      );

      // Reset prepared_quantity on target items
      if (targetItemIds.length > 0) {
        for (const id of targetItemIds) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/order_items?id=eq.${id}`,
            {
              headers: { ...headers, 'Prefer': 'return=minimal' },
              method: 'PATCH',
              body: JSON.stringify({ prepared_quantity: 0 }),
            }
          );
        }
      }
    } else {
      // No primary order exists — just move all source orders to target table
      for (const srcOrder of sourceOrders) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/orders?id=eq.${srcOrder.id}`,
          {
            headers: { ...headers, 'Prefer': 'return=minimal' },
            method: 'PATCH',
            body: JSON.stringify({ table_number: targetTable }),
          }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
