import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

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

    const { table_numbers, version } = await request.json();

    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'At least 2 table numbers required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction('TableMerge', async () => {
      const targetTable = table_numbers[0];
      const restTables = table_numbers.slice(1);

      const targetOrdersRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&status=neq.cancelled&select=*`,
        { headers }
      );
      const targetOrders = await targetOrdersRes.json();
      let primaryOrder = targetOrders?.[0];

      const sourceOrders: any[] = [];
      for (const tNum of restTables) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${tNum}&status=neq.paid&status=neq.cancelled&select=*`,
          { headers }
        );
        const orders = await res.json();
        if (orders) sourceOrders.push(...orders);
      }

      if (sourceOrders.length === 0 && !primaryOrder) {
        throw new Error('No active orders to merge');
      }

      if (!primaryOrder && sourceOrders.length > 0) {
        primaryOrder = sourceOrders[0];
        // The first order found becomes the primary one on the target table
        const upgradeRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${primaryOrder.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            table_number: targetTable,
            version: (primaryOrder.version || 0) + 1
          }),
        });
        if (!upgradeRes.ok) throw new Error('Failed to elevate source order to primary');
        
        // Remove from source list so it's not merged into itself
        sourceOrders.shift();
      }

      let extraTotal = 0;
      let extraGuests = 0;

      for (const src of sourceOrders) {
        extraTotal += Number(src.total_amount || 0);
        extraGuests += Number(src.guest_count || 0);
        
        const mergeRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${src.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            merged_into: primaryOrder.id,
            version: (src.version || 0) + 1
          }),
        });
        if (!mergeRes.ok) throw new Error(`Failed to merge order ${src.id}`);
      }

      const finalUpdateRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${primaryOrder.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          total_amount: Number(primaryOrder.total_amount || 0) + extraTotal,
          guest_count: Number(primaryOrder.guest_count || 1) + extraGuests,
          version: (primaryOrder.version || 0) + 2 // Increment for the total update too
        }),
      });
      if (!finalUpdateRes.ok) throw new Error('Failed to update primary order totals');

      for (const tNum of restTables) {
        await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${tNum}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            status: 'merged', 
            merged_into_table: targetTable 
          }),
        });
      }
      
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${targetTable}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'occupied' }),
      });

      return { primary_order_id: primaryOrder.id, targetTable, merged_tables: restTables };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

