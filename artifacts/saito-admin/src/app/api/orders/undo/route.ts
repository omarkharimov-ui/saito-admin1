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

    const { action, data } = await request.json();

    if (!action || !data) {
      return NextResponse.json({ error: 'action and data required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction(`Undo${action}`, async () => {
      switch (action) {
        case 'merge': {
          const { sourceOrders, sourceTableNumbers, targetTable } = data;

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

          if (sourceOrders?.length) {
            const parentRes = await fetch(`${svc().url}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&select=*`, { headers: svc().headers });
            const parentOrder = (await parentRes.json())?.[0];

            for (const src of sourceOrders) {
              await fetch(`${svc().url}/rest/v1/orders?id=eq.${src.id}`, {
                method: 'PATCH',
                headers: svc().headers,
                body: JSON.stringify({ merged_into: null, version: (src.version || 0) + 1 }),
              });
            }

            if (parentOrder) {
              const childTotal = sourceOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
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

        case 'transfer': {
          const { orderIds, fromTable, toTable } = data;
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

