import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { primary_table_number, child_table_numbers } = await req.json();
    if (!primary_table_number || !child_table_numbers?.length) {
      return NextResponse.json({ error: 'primary_table_number and child_table_numbers required' }, { status: 400 });
    }

    const s = svc();

    const childTableNumbers = child_table_numbers.map((n: any) => Number(n));
    const childWhere = `table_number=in.(${childTableNumbers.join(',')})`;

    const [primaryFloor, childFloors, primaryOrders, childOrders] = await Promise.all([
      fetchJson(`${s.url}/rest/v1/table_floors?table_number=eq.${primary_table_number}&select=table_number,status,guest_count,total_amount,merged_into_table,reservation_id,reservation_name,reservation_phone,reservation_time`, s.headers),
      fetchJson(`${s.url}/rest/v1/table_floors?${childWhere}&select=table_number,status,guest_count,total_amount,merged_into_table,reservation_id,reservation_name,reservation_phone,reservation_time`, s.headers),
      fetchJson(`${s.url}/rest/v1/orders?table_number=eq.${primary_table_number}&status=not.in.(paid,cancelled,closed)&select=id,table_number,status,total_amount,guest_count,merged_into,version,order_items(*)`, s.headers),
      childTableNumbers.length > 0
        ? fetchJson(`${s.url}/rest/v1/orders?table_number=in.(${childTableNumbers.join(',')})&status=not.in.(paid,cancelled,closed)&select=id,table_number,status,total_amount,guest_count,merged_into,version,order_items(*)`, s.headers)
        : Promise.resolve([]),
    ]);

    const primaryHasOrder = (primaryOrders || []).length > 0;

    await fetch(`${s.url}/rest/v1/table_floors?${childWhere}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'empty',
        guest_count: null,
        total_amount: 0,
        merged_into_table: null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!primaryHasOrder) {
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${primary_table_number}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'empty',
          guest_count: null,
          total_amount: 0,
          merged_into_table: null,
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${primary_table_number}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          merged_into_table: null,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    const undo = {
      parentTable: primary_table_number,
      parentOrderId: primaryOrders?.[0]?.id || null,
      parentOldTotal: primaryOrders?.[0]?.total_amount ?? primaryFloor?.[0]?.total_amount ?? 0,
      parentOldGuests: primaryOrders?.[0]?.guest_count ?? primaryFloor?.[0]?.guest_count ?? null,
      childTables: childTableNumbers.map((tableNumber: number) => {
        const floor = childFloors?.find((t: any) => Number(t.table_number) === Number(tableNumber));
        const order = childOrders?.find((o: any) => Number(o.table_number) === Number(tableNumber)) || null;
        return {
          tableNumber,
          orderId: order?.id || null,
          totalAmount: order?.total_amount ?? floor?.total_amount ?? 0,
          guestCount: order?.guest_count ?? floor?.guest_count ?? null,
          tableState: floor || null,
          orderState: order || null,
        };
      }),
    };

    return NextResponse.json({
      success: true,
      data: { primaryTable: primary_table_number, childTables: childTableNumbers },
      undo,
    });
  } catch (error: any) {
    console.error('[API /orders/unmerge] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
