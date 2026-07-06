import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
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

        // Fetch current orders (REST — race mitigated by RPC atomicity)
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

        // Handle empty table grouping — create orders if none exist
        if (!primaryOrder && sourceOrders.length === 0) {
          // Create primary order on target table
          const createRes = await fetch(`${svc().url}/rest/v1/orders`, {
            method: 'POST',
            headers: { ...svc().headers, 'Prefer': 'return=representation' },
            body: JSON.stringify({
              table_number: targetTable,
              total_amount: 0,
              status: 'confirmed',
              kitchen_status: 'pending',
              guest_count: 1,
              version: 1,
            }),
          });
          if (!createRes.ok) throw new Error('Failed to create primary order');
          primaryOrder = (await createRes.json())?.[0];

          // Create child orders for rest tables (merged into primary)
          for (const tNum of restTables) {
            await fetch(`${svc().url}/rest/v1/orders`, {
              method: 'POST',
              headers: svc().headers,
              body: JSON.stringify({
                table_number: tNum,
                total_amount: 0,
                status: 'confirmed',
                merged_into: primaryOrder.id,
                kitchen_status: null,
                guest_count: 0,
                version: 1,
              }),
            });
          }

          // Update table floors for empty table grouping
          for (const tNum of restTables) {
            await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${tNum}`, {
              method: 'PATCH',
              headers: svc().headers,
              body: JSON.stringify({
                status: 'merged',
                merged_into_table: targetTable,
                guest_count: null,
              }),
            });
          }
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${targetTable}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ status: 'occupied', guest_count: 1 }),
          });

          // Return early — no orders to merge, skip RPC
          return {
            primary_order_id: primaryOrder.id,
            targetTable,
            merged_tables: restTables,
          };
        }

        if (!primaryOrder && sourceOrders.length > 0) {
          primaryOrder = sourceOrders[0];
          sourceOrders.shift();
        }

        // Compute totals before calling atomic RPC
        let extraTotal = 0;
        let extraGuests = 0;
        for (const src of sourceOrders) {
          extraTotal += Number(src.total_amount || 0);
          extraGuests += Number(src.guest_count || 0);
        }

        // Call atomic merge RPC (FOR UPDATE — detects stale reads)
        const sourceIds = sourceOrders.map(o => o.id);
        const { data: rpcResult, error: rpcError } = await supabase.rpc('merge_orders_atomic', {
          p_source_order_ids: sourceIds.length > 0 ? sourceIds : [],
          p_target_order_id: primaryOrder.id,
          p_extra_amount: extraTotal,
          p_extra_guests: extraGuests,
        });
        if (rpcError) throw new Error(rpcError.message);

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
          // Fetch reservation status before deciding action
          const srcResRes = await fetch(
            `${svc().url}/rest/v1/reservations?id=eq.${srcFloor.reservation_id}&select=status`,
            { headers: svc().headers }
          );
          const srcResData = await srcResRes.json();
          const srcReservation = srcResData?.[0];

          if (srcReservation) {
            const isCheckedIn = srcReservation.status === 'checked_in';
            const updateBody: Record<string, any> = {
              table_ids: table_numbers,
            };
            if (isCheckedIn) {
              updateBody.status = 'completed';
              updateBody.note = `Birləşdirildi → Masa ${targetTable}`;
            }
            await fetch(`${svc().url}/rest/v1/reservations?id=eq.${srcFloor.reservation_id}`, {
              method: 'PATCH',
              headers: svc().headers,
              body: JSON.stringify(updateBody),
            });
          }
        }
      }

      // Build reservation patch for target table
      const targetReservationPatch: Record<string, any> = {
        guest_count: totalGuests,
      };
      // Only mark occupied if source orders exist or target already occupied
      if (primaryOrder || restTables.length < table_numbers.length) {
        targetReservationPatch.status = 'occupied';
      }
      let keptReservationId: string | null = null;
      if (targetFloor?.reservation_id) {
        keptReservationId = targetFloor.reservation_id;
      } else if (mergedReservationIds.length > 0) {
        keptReservationId = mergedReservationIds[0];
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

      if (keptReservationId) {
        const allTableNumbers = [targetTable, ...restTables];
        await fetch(`${svc().url}/rest/v1/reservations?id=eq.${keptReservationId}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ table_ids: allTableNumbers }),
        });
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

      return {
        primary_order_id: primaryOrder.id,
        targetTable,
        merged_tables: restTables,
        undo: {
          sourceOrders: sourceOrders.map(o => ({ id: o.id, version: o.version, total_amount: o.total_amount })),
          sourceTableNumbers: restTables,
          targetTable,
        },
      };
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

