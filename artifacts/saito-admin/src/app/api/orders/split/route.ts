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
    const { table_number, table_numbers } = await request.json();
    
    // table_numbers is the array of tables we want to SEPARATE from the group
    const targetTables = table_numbers || (table_number ? [table_number] : []);
    
    if (targetTables.length === 0) {
      return NextResponse.json({ error: 'table_number or table_numbers required' }, { status: 400 });
    }

    // Process each selected table to unmerge it
    for (const tableNum of targetTables) {
        // 1. Clear table-level merged_into_table
        await fetch(
          `${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${tableNum}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ merged_into_table: null }),
          }
        );

        // 2. Find and unmerge orders for this specific table
        const orderRes = await fetch(
          `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${tableNum}&status=neq.paid&select=id,total_amount,merged_into`,
          { headers }
        );
        
        if (orderRes.ok) {
            const orders = await orderRes.json();
            for (const order of orders) {
                if (order.merged_into) {
                    // This was a child order, separate it
                    const parentId = order.merged_into;
                    
                    // a) Clear merged_into
                    await fetch(
                      `${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`,
                      {
                        method: 'PATCH',
                        headers: { ...headers, 'Prefer': 'return=minimal' },
                        body: JSON.stringify({ merged_into: null }),
                      }
                    );

                    // b) Subtract from parent order total
                    const parentRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}&select=total_amount`, { headers });
                    if (parentRes.ok) {
                        const parent = await parentRes.json();
                        if (parent?.[0]) {
                            const newTotal = Math.max(0, Number(parent[0].total_amount || 0) - Number(order.total_amount || 0));
                            await fetch(
                                `${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}`,
                                {
                                  method: 'PATCH',
                                  headers: { ...headers, 'Prefer': 'return=minimal' },
                                  body: JSON.stringify({ total_amount: newTotal }),
                                }
                            );
                        }
                    }
                }
            }
        }
    }

    return NextResponse.json({ success: true, split_count: targetTables.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
