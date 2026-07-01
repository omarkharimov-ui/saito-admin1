import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { from_table, to_table, version } = await request.json();

    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction('TableTransfer', async () => {
      const sourceRes = await fetch(
        `${svc().url}/rest/v1/orders?table_number=eq.${from_table}&status=neq.paid&select=*`,
        { headers: svc().headers }
      );
      const sourceOrders = await sourceRes.json();
      
      if (!sourceOrders || sourceOrders.length === 0) {
        throw new Error('No active orders on source table');
      }

      const targetTableRes = await fetch(
        `${svc().url}/rest/v1/table_floors?table_number=eq.${to_table}&select=*`,
        { headers: svc().headers }
      );
      const targetTables = await targetTableRes.json();
      const targetTable = targetTables?.[0];

      if (targetTable && (targetTable.status === 'occupied' || targetTable.status === 'reserved')) {
        throw new Error(targetTable.status === 'reserved' ? 'TARGET_TABLE_RESERVED' : 'TARGET_TABLE_OCCUPIED');
      }

      // CRITICAL: Transfer reservation from source to target table
      const sourceFloorRes = await fetch(
        `${svc().url}/rest/v1/table_floors?table_number=eq.${from_table}&select=*`,
        { headers: svc().headers }
      );
      const sourceFloorData = await sourceFloorRes.json();
      const sourceFloor = sourceFloorData?.[0];
      
      const reservationPatch: Record<string, any> = {};
      if (sourceFloor?.reservation_id) {
        reservationPatch.reservation_id = sourceFloor.reservation_id;
        reservationPatch.reservation_name = sourceFloor.reservation_name;
        reservationPatch.reservation_phone = sourceFloor.reservation_phone;
        reservationPatch.reservation_time = sourceFloor.reservation_time;
      }

      for (const order of sourceOrders) {
        const updateRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${order.id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({
            table_number: to_table,
            version: (order.version || 0) + 1,
            updated_at: new Date().toISOString()
          }),
        });
        if (!updateRes.ok) throw new Error(`Failed to move order ${order.id}`);
      }

      await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${from_table}`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify({ 
          status: 'empty', 
          reservation_id: null, 
          reservation_name: null, 
          reservation_phone: null, 
          reservation_time: null, 
          guest_count: null,
          merged_into_table: null,
        }),
      });

      await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${to_table}`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify({ 
          status: 'occupied',
          guest_count: sourceOrders.reduce((s: number, o: any) => s + Number(o.guest_count || 0), 0) || null,
          ...reservationPatch, // Transfer reservation data to target table
        }),
      });

      return { from_table, to_table, moved_count: sourceOrders.length };
    });

    if (!result.success) {
      if (result.error === 'TARGET_TABLE_RESERVED') {
        return NextResponse.json({ error: 'Hədəf masa rezerv edilib' }, { status: 409 });
      }
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

