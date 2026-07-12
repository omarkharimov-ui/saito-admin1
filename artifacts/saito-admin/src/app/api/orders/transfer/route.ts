import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { from_table, to_table } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const s = svc();

    // Check if source is a merged parent (has children)
    const childrenRes = await fetch(`${s.url}/rest/v1/table_floors?merged_into_table=eq.${from_table}&select=table_number`, { headers: s.headers });
    const children = await childrenRes.json();
    const childNumbers = (children || []).map((c: any) => c.table_number);
    const isMergedParent = childNumbers.length > 0;

    if (isMergedParent) {
      // Get all orders in the merged group (primary + children)
      const ordersRes = await fetch(`${s.url}/rest/v1/orders?table_number=in.(${[from_table, ...childNumbers].join(',')})&status=not.in.(paid,cancelled,closed)&select=id,table_number,status,total_amount,guest_count,merged_into,version`, { headers: s.headers });
      const groupOrders = await ordersRes.json();
      
      // Calculate totals for the entire group
      const totalAmount = groupOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
      const totalGuests = groupOrders.reduce((sum: number, o: any) => sum + (o.guest_count || 0), 0);
      const primaryOrder = groupOrders.find((o: any) => o.table_number === from_table && o.merged_into === null) || groupOrders[0];
      
      if (primaryOrder) {
        // Update primary order with consolidated amounts
        await fetch(`${s.url}/rest/v1/orders?id=eq.${primaryOrder.id}`, {
          method: 'PATCH',
          headers: { ...s.headers, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            table_number: to_table,
            total_amount: totalAmount,
            guest_count: totalGuests,
            updated_at: new Date().toISOString()
          }),
        });
      }

      // Update all child orders to point to primary table
      for (const childOrder of groupOrders.filter((o: any) => o.table_number !== from_table)) {
        await fetch(`${s.url}/rest/v1/orders?id=eq.${childOrder.id}`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({
            table_number: to_table,
            merged_into: primaryOrder?.id || childOrder.id,
            updated_at: new Date().toISOString()
          }),
        });
      }

      // Update table_floors for target table
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${to_table}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'occupied',
          total_amount: totalAmount,
          guest_count: totalGuests,
          merged_into_table: null,
          last_activity_at: new Date().toISOString()
        }),
      });

      // Clear source tables
      await fetch(`${s.url}/rest/v1/table_floors?table_number=in.(${[from_table, ...childNumbers].join(',')})`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'empty',
          total_amount: 0,
          guest_count: null,
          merged_into_table: null
        }),
      });

      return NextResponse.json({
        success: true,
        data: {
          moved_tables: [from_table, ...childNumbers],
          target_table: to_table,
          total_amount: totalAmount,
          total_guests: totalGuests
        },
        undo: { fromTable: from_table, toTable: to_table, orderIds: groupOrders.map((o: any) => o.id) }
      });
    }

    // Normal transfer (non-merged)
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/transfer_tables_v3`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_from_table: from_table,
        p_to_table: to_table,
        p_performed_by: auth.user?.id || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error('[Transfer Fatal]', errText);
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    const data = await rpcRes.json();

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        undo: { fromTable: from_table, toTable: to_table, orderIds: data?.order_ids || [] }
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

