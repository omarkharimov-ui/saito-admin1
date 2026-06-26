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
    if (auth instanceof NextResponse) return auth;

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
              await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${tableNum}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ status: 'occupied', merged_into_table: null }),
              });
            }
          }

          if (sourceOrders?.length) {
            const parentRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?table_number=eq.${targetTable}&status=neq.paid&select=*`, { headers });
            const parentOrder = (await parentRes.json())?.[0];

            for (const src of sourceOrders) {
              await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${src.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ merged_into: null, version: (src.version || 0) + 1 }),
              });
            }

            if (parentOrder) {
              const childTotal = sourceOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
              const newTotal = Math.max(0, Number(parentOrder.total_amount || 0) - childTotal);
              await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${parentOrder.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ total_amount: newTotal, version: (parentOrder.version || 0) + 1 }),
              });
            }
          }
          break;
        }

        case 'transfer': {
          const { orderIds, fromTable, toTable } = data;
          for (const oid of orderIds) {
            await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ table_number: fromTable }),
            });
          }
          
          await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${fromTable}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'occupied' }),
          });
          
          await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${toTable}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'available' }),
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

