import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { primary_table_number, child_table_numbers } = await req.json();
    if (!primary_table_number || !child_table_numbers?.length) {
      return NextResponse.json({ error: 'primary_table_number and child_table_numbers required' }, { status: 400 });
    }

    const s = svc();

    const result = await executeTransactionalOrderAction('TableUnmerge', async () => {
      // 1. Get primary order
      const primaryOrderRes = await fetch(`${s.url}/rest/v1/orders?table_number=eq.${primary_table_number}&status=neq.paid&status=neq.cancelled&merged_into=is.null&select=*`, { headers: s.headers });
      const primaryOrder = (await primaryOrderRes.json())?.[0];
      if (!primaryOrder) throw new Error('Primary order not found');

      // 2. Get child orders that were merged into this primary order
      const childOrdersRes = await fetch(`${s.url}/rest/v1/orders?merged_into=eq.${primaryOrder.id}&select=*`, { headers: s.headers });
      const childOrders: any[] = await childOrdersRes.json();

      let totalRemovedAmount = 0;
      let totalRemovedGuests = 0;

      for (const tNum of child_table_numbers) {
        const order = childOrders.find(o => o.table_number === tNum);

        if (order) {
          totalRemovedAmount += Number(order.total_amount || 0);
          totalRemovedGuests += Number(order.guest_count || 0);

          // Restore order as standalone
          await fetch(`${s.url}/rest/v1/orders?id=eq.${order.id}`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify({ 
              merged_into: null,
              version: (order.version || 0) + 1
            }),
          });
        }

        // Restore table status: 'occupied' only if it has an order; otherwise 'empty'
        await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${tNum}`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ 
            status: order ? 'occupied' : 'empty', 
            merged_into_table: null 
          }),
        });
      }

      // 3. Update primary order totals
      await fetch(`${s.url}/rest/v1/orders?id=eq.${primaryOrder.id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          total_amount: Math.max(0, Number(primaryOrder.total_amount || 0) - totalRemovedAmount),
          guest_count: Math.max(1, Number(primaryOrder.guest_count || 1) - totalRemovedGuests),
          version: (primaryOrder.version || 0) + 1
        }),
      });

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /orders/unmerge] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
