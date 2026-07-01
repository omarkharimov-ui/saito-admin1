import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';
import { TableStatus } from '@/lib/tableStatus';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_numbers } = await request.json();
    
    if (!table_numbers || table_numbers.length === 0) {
      return NextResponse.json({ error: 'table_numbers required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction('TableUnmerge', async () => {
      for (const tableNum of table_numbers) {
        const floorRes = await fetch(
          `${svc().url}/rest/v1/table_floors?select=*&table_number=eq.${tableNum}`,
          { headers: svc().headers }
        );
        const floorData = floorRes.ok ? await floorRes.json() : [];
        const currentFloor = floorData?.[0];

        // Determine what guest count to restore to child table
        let childGuests = 0;

        await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${tableNum}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ 
            status: TableStatus.OCCUPIED, 
            merged_into_table: null,
            guest_count: null,
          }),
        });

        const orderRes = await fetch(
          `${svc().url}/rest/v1/orders?table_number=eq.${tableNum}&status=neq.paid&status=neq.cancelled&select=*`,
          { headers: svc().headers }
        );
        const orders = await orderRes.json();
        
        if (orders) {
          for (const order of orders) {
            if (order.merged_into) {
              const parentId = order.merged_into;
              
              childGuests += Number(order.guest_count || 0);

              await fetch(`${svc().url}/rest/v1/orders?id=eq.${order.id}`, {
                method: 'PATCH',
                headers: svc().headers,
                body: JSON.stringify({ 
                  merged_into: null,
                  version: (order.version || 0) + 1
                }),
              });

              const parentRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${parentId}&select=*`, { headers: svc().headers });
              const parent = (await parentRes.json())?.[0];
              
              if (parent) {
                const newTotal = Math.max(0, Number(parent.total_amount || 0) - Number(order.total_amount || 0));
                const newGuests = Math.max(1, Number(parent.guest_count || 1) - Number(order.guest_count || 0));
                
                await fetch(`${svc().url}/rest/v1/orders?id=eq.${parentId}`, {
                  method: 'PATCH',
                  headers: svc().headers,
                  body: JSON.stringify({ 
                    total_amount: newTotal, 
                    guest_count: newGuests,
                    version: (parent.version || 0) + 1
                  }),
                });
              }
            }
          }
        }

        // Write combined guest count to child table
        if (childGuests > 0) {
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${tableNum}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ guest_count: childGuests }),
          });
        }

        // Check if parent table now has no active orders and should be emptied
        if (currentFloor?.merged_into_table) {
          const parentTableNum = currentFloor.merged_into_table;
          const parentOrdersRes = await fetch(
            `${svc().url}/rest/v1/orders?select=id&table_number=eq.${parentTableNum}&status=neq.paid&status=neq.cancelled`,
            { headers: svc().headers }
          );
          const parentOrders = parentOrdersRes.ok ? await parentOrdersRes.json() : [];
          if (!parentOrders || parentOrders.length === 0) {
            await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${parentTableNum}`, {
              method: 'PATCH',
              headers: svc().headers,
              body: JSON.stringify({ status: 'empty', guest_count: null }),
            });
          }
        }
      }
      return { unmerged_tables: table_numbers };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
