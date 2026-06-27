import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction, TABLE_STATES } from '@/lib/transaction';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

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
        await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${tableNum}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            status: TABLE_STATES.OCCUPIED, 
            merged_into_table: null 
          }),
        });

        const orderRes = await fetch(
          `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${tableNum}&status=neq.paid&status=neq.cancelled&select=*`,
          { headers }
        );
        const orders = await orderRes.json();
        
        if (orders) {
          for (const order of orders) {
            if (order.merged_into) {
              const parentId = order.merged_into;
              
              await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ 
                  merged_into: null,
                  version: (order.version || 0) + 1
                }),
              });

              const parentRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}&select=*`, { headers });
              const parent = (await parentRes.json())?.[0];
              
              if (parent) {
                const newTotal = Math.max(0, Number(parent.total_amount || 0) - Number(order.total_amount || 0));
                const newGuests = Math.max(1, Number(parent.guest_count || 1) - Number(order.guest_count || 0));
                
                await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${parentId}`, {
                  method: 'PATCH',
                  headers,
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
      }
      return { unmerged_tables: table_numbers };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
