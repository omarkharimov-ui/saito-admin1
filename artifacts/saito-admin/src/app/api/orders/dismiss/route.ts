import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const supabase = await createAuthClient();

    const { data: table } = await supabase
      .from('table_floors')
      .select('id, status, merged_into_table, reservation_id')
      .eq('table_number', table_number)
      .maybeSingle();

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const allTableNumbers = [table_number];
    const { data: mergedTables } = await supabase
      .from('table_floors')
      .select('table_number')
      .or(`merged_into_table.eq.${table.id},table_number.eq.${table_number}`);

    if (mergedTables) {
      const linked = mergedTables.map(t => t.table_number).filter(Boolean);
      allTableNumbers.push(...linked);
    }
    const uniqueTableNumbers = [...new Set(allTableNumbers)];

    const { data: orders } = await supabase
      .from('orders')
      .select('id, status, total_amount, reservation_id')
      .in('table_number', uniqueTableNumbers)
      .not('status', 'in', '(paid,cancelled)');

    const activeOrders = orders || [];

    if (activeOrders.length > 0) {
      const orderIds = activeOrders.map(o => o.id);
      const resId = activeOrders.find(o => o.reservation_id)?.reservation_id || null;

      await supabase
        .from('orders')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .in('id', orderIds);

      await supabase
        .from('order_items')
        .update({ kitchen_status: 'cancelled' })
        .in('order_id', orderIds);

      for (const order of activeOrders) {
        await supabase.from('cancelled_orders').insert({
          order_id: order.id,
          table_number,
          total_amount: Number(order.total_amount || 0),
          reason: 'dismiss',
          reason_text: 'Masa boşaldıldı',
          items: [],
          created_at: new Date().toISOString(),
        }).maybeSingle();
      }

      if (resId) {
        await supabase
          .from('reservations')
          .update({ status: 'no_show' })
          .eq('id', resId);
      }
    }

    const tableReservationId = table.reservation_id;
    if (tableReservationId && !activeOrders.some(o => o.reservation_id === tableReservationId)) {
      await supabase
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', tableReservationId);
    }

    await supabase
      .from('table_floors')
      .update({
        status: 'empty',
        reservation_id: null,
        reservation_name: null,
        reservation_phone: null,
        reservation_time: null,
        guest_count: null,
        merged_into_table: null,
      })
      .in('table_number', uniqueTableNumbers);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
