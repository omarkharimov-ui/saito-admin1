import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { runOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { action, data } = await request.json();

    if (!action || !data) {
      return NextResponse.json({ error: 'action and data required' }, { status: 400 });
    }

    const result = await runOrderAction(`Undo${action}`, async () => {
      switch (action) {
        case 'merge': {
          const { sourceOrders, sourceTableNumbers, targetTable } = data;

          // 1. Restore child table_floors
          if (sourceTableNumbers?.length) {
            for (const tableNum of sourceTableNumbers) {
              await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${tableNum}`, {
                method: 'PATCH',
                headers: svc().headers,
                body: JSON.stringify({ 
                  status: 'occupied', 
                  merged_into_table: null,
                  guest_count: null,
                }),
              });
            }
          }

          // 2. Restore child orders + recalculate parent total
          if (sourceOrders?.length) {
            const parentRes = await fetch(`${svc().url}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&status=neq.cancelled&select=*`, { headers: svc().headers });
            const parentOrder = (await parentRes.json())?.[0];

            let childTotal = 0;
            for (const src of sourceOrders) {
              childTotal += Number(src.total_amount || 0);
              await fetch(`${svc().url}/rest/v1/orders?id=eq.${src.id}`, {
                method: 'PATCH',
                headers: svc().headers,
                body: JSON.stringify({ merged_into: null, version: (src.version || 0) + 1 }),
              });
            }

            if (parentOrder) {
              const newTotal = Math.max(0, Number(parentOrder.total_amount || 0) - childTotal);
              await fetch(`${svc().url}/rest/v1/orders?id=eq.${parentOrder.id}`, {
                method: 'PATCH',
                headers: svc().headers,
                body: JSON.stringify({ total_amount: newTotal, version: (parentOrder.version || 0) + 1 }),
              });
            }
          }
          break;
        }

        case 'unmerge': {
          const { parentTable, parentOrderId, parentOldTotal, parentOldGuests, childTables } = data;

          // Re-merge each child table into parent
          for (const child of childTables) {
            await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${child.tableNumber}`, {
              method: 'PATCH',
              headers: svc().headers,
              body: JSON.stringify({
                status: 'merged',
                merged_into_table: parentTable,
              }),
            });

            if (child.orderId) {
              await fetch(`${svc().url}/rest/v1/orders?id=eq.${child.orderId}`, {
                method: 'PATCH',
                headers: svc().headers,
                body: JSON.stringify({ merged_into: parentOrderId }),
              });
            }
          }

          // Restore parent order totals
          if (parentOrderId) {
            await fetch(`${svc().url}/rest/v1/orders?id=eq.${parentOrderId}`, {
              method: 'PATCH',
              headers: svc().headers,
              body: JSON.stringify({
                total_amount: parentOldTotal,
                guest_count: parentOldGuests,
              }),
            });
          }
          break;
        }

        case 'transfer': {
          const { orderIds, fromTable, toTable } = data;
          if (!orderIds?.length) break;
          for (const oid of orderIds) {
            await fetch(`${svc().url}/rest/v1/orders?id=eq.${oid}`, {
              method: 'PATCH',
              headers: svc().headers,
              body: JSON.stringify({ table_number: fromTable }),
            });
          }
          
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${fromTable}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ status: 'occupied' }),
          });
          
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${toTable}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ status: 'empty' }),
          });
          break;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
      return { action, success: true };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

