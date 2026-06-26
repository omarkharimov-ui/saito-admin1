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

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const { table_number } = await req.json();
    if (!table_number) return NextResponse.json({ error: 'Table number required' }, { status: 400 });

    const result = await executeTransactionalOrderAction('DismissTable', async () => {
      // 1. Find all active orders for this table
      const ordersRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id&table_number=eq.${table_number}&status=neq.paid&status=neq.cancelled`, { headers });
      const orders = await ordersRes.json();

      if (Array.isArray(orders) && orders.length > 0) {
        // 2. Mark orders as cancelled (Soft Delete)
        const orderIds = orders.map(o => o.id);
        await fetch(`${SUPABASE_URL}/rest/v1/orders?id=in.(${orderIds.join(',')})`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            status: 'cancelled',
            cancelled_at: new Date().toISOString()
          }),
        });
      }

      // 3. Reset table floor record
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${table_number}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: TABLE_STATES.AVAILABLE,
          reservation_id: null,
          reservation_name: null,
          reservation_phone: null,
          reservation_time: null,
          guest_count: null,
          merged_into_table: null
        }),
      });

      return { table_number, status: TABLE_STATES.AVAILABLE };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

