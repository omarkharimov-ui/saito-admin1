import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';
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

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { from_table, to_table , terminal_id } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }
    if (from_table === to_table) {
      return NextResponse.json({ error: 'Eyni masaya köçürmə edə bilməzsiniz' }, { status: 400 });
    }

    const s = svc();

    // Snapshot source/target for undo BEFORE atomic transfer
    const [srcOrdersRes, srcTableRes, tgtTableRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/orders?table_number=eq.${from_table}&status=not.in.(paid,cancelled,closed)&select=id,table_number,status,total_amount,guest_count,merged_into,version`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${from_table}&select=status,guest_count,total_amount,merged_into_table,reservation_id,reservation_name,reservation_phone,reservation_time`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${to_table}&select=status,guest_count,total_amount,merged_into_table,reservation_id,reservation_name,reservation_phone,reservation_time`, { headers: s.headers }),
    ]);
    const sourceOrders = await srcOrdersRes.json();
    const sourceTableData = (await srcTableRes.json()) || [];
    const targetTableData = (await tgtTableRes.json()) || [];

    if (!sourceOrders || sourceOrders.length === 0) {
      return NextResponse.json({ error: 'Aktiv sifariş yoxdur' }, { status: 400 });
    }

    const orderSnapshot = sourceOrders.map((o: any) => ({
      id: o.id, table_number: o.table_number, total_amount: o.total_amount,
      guest_count: o.guest_count, status: o.status, merged_into: o.merged_into, version: o.version,
    }));
    const tableSnapshot = {
      table_number: from_table,
      status: sourceTableData[0]?.status,
      guest_count: sourceTableData[0]?.guest_count,
      total_amount: sourceTableData[0]?.total_amount,
      merged_into_table: sourceTableData[0]?.merged_into_table,
    };

    // Atomic transfer RPC handles: order moves, table statuses, guest/total transfer, reservation update
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/transfer_table_atomic`, {
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
      return NextResponse.json({ error: `Transfer failed: ${errText}` }, { status: 400 });
    }

    const data = await rpcRes.json();

    const totalGuests = orderSnapshot.reduce((sum: number, o: any) => sum + (Number(o.guest_count) || 0), 0);
    const totalAmount = orderSnapshot.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);
    const movedOrderIds = orderSnapshot.map((o: any) => o.id);

    return NextResponse.json({
      success: true,
      data: {
        from_table,
        to_table,
        total_amount: totalAmount,
        total_guests: totalGuests,
        moved_order_ids: movedOrderIds
      },
      undo: {
        from_table,
        to_table,
        orders: orderSnapshot,
        table: {
          ...tableSnapshot,
          target_original: targetTableData ? {
            id: targetTableData.id,
            status: targetTableData.status,
            guest_count: targetTableData.guest_count,
            total_amount: targetTableData.total_amount,
            merged_into_table: targetTableData.merged_into_table,
            reservation_id: targetTableData.reservation_id,
            reservation_name: targetTableData.reservation_name,
            reservation_phone: targetTableData.reservation_phone,
            reservation_time: targetTableData.reservation_time,
          } : null,
        }
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

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { from_table, to_table, orders, table , terminal_id } = await request.json();
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

    // Revert target table to its original state
    if (table) {
      const targetOriginal = table?.target_original || table;
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${to_table}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: targetOriginal.status || table.status,
          guest_count: targetOriginal.guest_count ?? table.guest_count,
          total_amount: targetOriginal.total_amount ?? table.total_amount,
          merged_into_table: targetOriginal.merged_into_table ?? table.merged_into_table,
          reservation_id: targetOriginal.reservation_id ?? null,
          reservation_name: targetOriginal.reservation_name ?? null,
          reservation_phone: targetOriginal.reservation_phone ?? null,
          reservation_time: targetOriginal.reservation_time ?? null,
          updated_at: now
        }),
      });
    }

    // Revert source table
    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${from_table}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: table?.status || 'occupied',
        guest_count: table?.guest_count ?? null,
        total_amount: table?.total_amount ?? 0,
        merged_into_table: table?.merged_into_table ?? null,
        updated_at: now
      }),
    });

    return NextResponse.json({ success: true, message: 'Transfer geri alındı' });
  } catch (error: any) {
    console.error('[Transfer Undo Fatal]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
