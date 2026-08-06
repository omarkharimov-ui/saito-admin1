import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

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

    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { from_table, to_table } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const s = svc();
    const now = new Date().toISOString();

    // Fetch source order items + table info + target table info in one go
    const [ordersRes, tableRes, targetTableRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/orders?table_number=eq.${from_table}&status=not.in.(paid,cancelled,closed)&select=id,table_number,status,total_amount,guest_count,merged_into,version,order_items(*)`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${from_table}&select=status,guest_count,total_amount,merged_into_table,reservation_id,reservation_name,reservation_phone,reservation_time`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${to_table}&select=status,guest_count,total_amount,merged_into_table,reservation_id,reservation_name,reservation_phone,reservation_time`, { headers: s.headers })
    ]);

    const sourceOrders = await ordersRes.json();
    const sourceTable = (await tableRes.json()) || [];
    const sourceTableData = sourceTable[0];
    const targetTable = (await targetTableRes.json()) || [];
    const targetTableData = targetTable[0] || {};

    if (!sourceOrders || sourceOrders.length === 0) {
      return NextResponse.json({ error: 'Aktiv sifariş yoxdur' }, { status: 400 });
    }

    // Snapshot for undo
    const orderSnapshot = sourceOrders.map((o: any) => ({
      id: o.id,
      table_number: o.table_number,
      total_amount: o.total_amount,
      guest_count: o.guest_count,
      status: o.status,
      merged_into: o.merged_into,
      version: o.version,
    }));
    const tableSnapshot = {
      table_number: from_table,
      status: sourceTableData?.status,
      guest_count: sourceTableData?.guest_count,
      total_amount: sourceTableData?.total_amount,
      merged_into_table: sourceTableData?.merged_into_table,
      reservation_id: sourceTableData?.reservation_id ?? null,
      reservation_name: sourceTableData?.reservation_name ?? null,
      reservation_phone: sourceTableData?.reservation_phone ?? null,
      reservation_time: sourceTableData?.reservation_time ?? null,
    };
    const targetTableSnapshot = {
      table_number: to_table,
      status: targetTableData?.status,
      guest_count: targetTableData?.guest_count,
      total_amount: targetTableData?.total_amount,
      merged_into_table: targetTableData?.merged_into_table,
      reservation_id: targetTableData?.reservation_id ?? null,
      reservation_name: targetTableData?.reservation_name ?? null,
      reservation_phone: targetTableData?.reservation_phone ?? null,
      reservation_time: targetTableData?.reservation_time ?? null,
    };

    const orderIds = orderSnapshot.map((o: any) => o.id);

    // 1) Move all order items logically: parent -> to_table, children keep existing to_table
    const parentOrder = orderSnapshot.find((o: any) => o.merged_into === null) || orderSnapshot[0];
    const childOrders = orderSnapshot.filter((o: any) => o.merged_into !== null);

    // Update parent order to target table
    await fetch(`${s.url}/rest/v1/orders?id=eq.${parentOrder.id}`, {
      method: 'PATCH',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        table_number: to_table,
        updated_at: now
      }),
    });

    // Move child orders to the target table too. They keep their merged_into
    // parent link, but their own table_number must follow the source so the
    // Orders page shows them under the new (target) table, not the old one.
    for (const child of childOrders) {
      await fetch(`${s.url}/rest/v1/orders?id=eq.${child.id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ table_number: to_table, updated_at: now }),
      });
    }

    // 2) Transfer guest count and total to target table_floors
    const totalGuests = orderSnapshot.reduce((sum: number, o: any) => sum + (Number(o.guest_count) || 0), 0);
    const totalAmount = orderSnapshot.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);

    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${to_table}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'occupied',
        guest_count: totalGuests,
        total_amount: totalAmount,
        merged_into_table: null,
        reservation_id: null,
        reservation_name: null,
        reservation_phone: null,
        reservation_time: null,
        updated_at: now
      }),
    });

    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${from_table}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'empty',
        guest_count: null,
        total_amount: 0,
        merged_into_table: null,
        reservation_id: null,
        reservation_name: null,
        reservation_phone: null,
        reservation_time: null,
        updated_at: now
      }),
    });

    return NextResponse.json({
      success: true,
      data: {
        from_table,
        to_table,
        total_amount: totalAmount,
        total_guests: totalGuests,
        moved_order_ids: orderIds
      },
      undo: {
        from_table,
        to_table,
        orders: orderSnapshot,
        table: tableSnapshot,
        targetTable: targetTableSnapshot
      }
    });
  } catch (error: any) {
    console.error('[Transfer Fatal]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { from_table, to_table, orders, table, targetTable } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const s = svc();
    const now = new Date().toISOString();

    // Revert orders back to from_table
    for (const order of (orders || [])) {
      await fetch(`${s.url}/rest/v1/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        headers: { ...s.headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          table_number: from_table,
          total_amount: order.total_amount,
          guest_count: order.guest_count,
          status: order.status,
          merged_into: order.merged_into,
          version: (order.version || 0) + 1,
          updated_at: now
        }),
      });
    }

    // Revert target table to ITS pre-transfer state
    const tt = targetTable || {};
    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${to_table}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: tt.status ?? 'empty',
        guest_count: tt.guest_count ?? null,
        total_amount: tt.total_amount ?? 0,
        merged_into_table: tt.merged_into_table ?? null,
        reservation_id: tt.reservation_id ?? null,
        reservation_name: tt.reservation_name ?? null,
        reservation_phone: tt.reservation_phone ?? null,
        reservation_time: tt.reservation_time ?? null,
        updated_at: now
      }),
    });

    // Revert source table to its pre-transfer state
    const t = table || {};
    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${from_table}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: t.status ?? 'occupied',
        guest_count: t.guest_count ?? null,
        total_amount: t.total_amount ?? 0,
        merged_into_table: t.merged_into_table ?? null,
        reservation_id: t.reservation_id ?? null,
        reservation_name: t.reservation_name ?? null,
        reservation_phone: t.reservation_phone ?? null,
        reservation_time: t.reservation_time ?? null,
        updated_at: now
      }),
    });

    return NextResponse.json({ success: true, message: 'Transfer geri alındı' });
  } catch (error: any) {
    console.error('[Transfer Undo Fatal]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

