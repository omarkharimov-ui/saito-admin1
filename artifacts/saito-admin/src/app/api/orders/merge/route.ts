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

    const { table_numbers, version } = await request.json();

    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'At least 2 table numbers required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction('TableMerge', async () => {
      const targetTable = table_numbers[0];
      const restTables = table_numbers.slice(1);

      const targetOrdersRes = await fetch(
        `${svc().url}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&status=neq.cancelled&select=*`,
        { headers: svc().headers }
      );
      const targetOrders = await targetOrdersRes.json();
      let primaryOrder = targetOrders?.[0];

      const sourceOrders: any[] = [];
      for (const tNum of restTables) {
        const res = await fetch(
          `${svc().url}/rest/v1/orders?table_number=eq.${tNum}&status=neq.paid&status=neq.cancelled&select=*`,
          { headers: svc().headers }
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
        const upgradeRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${primaryOrder.id}`, {
          method: 'PATCH',
          headers: svc().headers,
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
        
        const mergeRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${src.id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ 
            merged_into: primaryOrder.id,
            version: (src.version || 0) + 1
          }),
        });
        if (!mergeRes.ok) throw new Error(`Failed to merge order ${src.id}`);
      }

      const finalUpdateRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${primaryOrder.id}`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify({
          total_amount: Number(primaryOrder.total_amount || 0) + extraTotal,
          guest_count: Number(primaryOrder.guest_count || 1) + extraGuests,
          version: (primaryOrder.version || 0) + 1
        }),
      });
      if (!finalUpdateRes.ok) throw new Error('Failed to update primary order totals');

      // Determine combined guest count for target table
      const totalGuests = (Number(primaryOrder?.guest_count || 1)) + extraGuests;

      // CRITICAL: Merge reservations — transfer source table reservations to target
      const targetFloorRes = await fetch(
        `${svc().url}/rest/v1/table_floors?table_number=eq.${targetTable}&select=*`,
        { headers: svc().headers }
      );
      const targetFloorData = await targetFloorRes.json();
      const targetFloor = targetFloorData?.[0];
      
      const mergedReservationIds: string[] = [];
      for (const tNum of restTables) {
        const srcFloorRes = await fetch(
          `${svc().url}/rest/v1/table_floors?table_number=eq.${tNum}&select=*`,
          { headers: svc().headers }
        );
        const srcFloorData = await srcFloorRes.json();
        const srcFloor = srcFloorData?.[0];
        
        if (srcFloor?.reservation_id) {
          mergedReservationIds.push(srcFloor.reservation_id);
          // Mark source reservations as no_show or completed (they're now merged)
          await fetch(`${svc().url}/rest/v1/reservations?id=eq.${srcFloor.reservation_id}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ status: 'completed', note: `Birləşdirildi → Masa ${targetTable}` }),
          }).catch(() => {});
        }
      }

      // Build reservation patch for target table
      const targetReservationPatch: Record<string, any> = {
        status: 'occupied',
        guest_count: totalGuests,
      };
      if (targetFloor?.reservation_id) {
        // Keep target's existing reservation
      } else if (mergedReservationIds.length > 0) {
        // Use first merged reservation on target table
        const mergedRes = await fetch(
          `${svc().url}/rest/v1/reservations?id=eq.${mergedReservationIds[0]}&select=*`,
          { headers: svc().headers }
        );
        const mergedResData = await mergedRes.json();
        const mergedReservation = mergedResData?.[0];
        if (mergedReservation) {
          targetReservationPatch.reservation_id = mergedReservation.id;
          targetReservationPatch.reservation_name = mergedReservation.name;
          targetReservationPatch.reservation_phone = mergedReservation.phone;
          targetReservationPatch.reservation_time = mergedReservation.time;
        }
      }

      for (const tNum of restTables) {
        await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${tNum}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ 
            status: 'merged', 
            merged_into_table: targetTable,
            reservation_id: null,
            reservation_name: null,
            reservation_phone: null,
            reservation_time: null,
            guest_count: null,
          }),
        });
      }
      
       await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${targetTable}`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify(targetReservationPatch),
      });

      return { primary_order_id: primaryOrder.id, targetTable, merged_tables: restTables };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

