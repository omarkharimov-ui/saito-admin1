import { NextRequest, NextResponse } from 'next/server';
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
    const { from_table, to_table, version } = await request.json();

    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction('TableTransfer', async () => {
      // 1. Get all non-paid orders on source table
      const sourceRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?table_number=eq.${from_table}&status=neq.paid&select=*`,
        { headers }
      );
      const sourceOrders = await sourceRes.json();
      
      if (!sourceOrders || sourceOrders.length === 0) {
        throw new Error('No active orders on source table');
      }

      // 2. Check for target table status
      const targetTableRes = await fetch(
        `${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${to_table}&select=*`,
        { headers }
      );
      const targetTables = await targetTableRes.json();
      const targetTable = targetTables?.[0];

      if (targetTable && targetTable.status === 'occupied') {
        throw new Error('TARGET_TABLE_OCCUPIED');
      }

      // 3. Perform atomic transfer of all source orders
      for (const order of sourceOrders) {
        const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            table_number: to_table,
            version: (order.version || 0) + 1,
            updated_at: new Date().toISOString()
          }),
        });
        if (!updateRes.ok) throw new Error(`Failed to move order ${order.id}`);
      }

      // 4. Update Table States
      // Clear source table
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${from_table}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'available', reservation_id: null, reservation_name: null }),
      });

      // Set target table to occupied
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${to_table}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'occupied' }),
      });

      return { from_table, to_table, moved_count: sourceOrders.length };
    });

    if (!result.success) {
      if (result.error === 'TARGET_TABLE_OCCUPIED') {
        return NextResponse.json({ error: 'Target table is already occupied' }, { status: 409 });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

