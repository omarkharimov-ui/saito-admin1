import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createAuthClient();
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const { data: table } = await supabase
      .from('table_floors')
      .select('id, table_number, status, merged_into_table, reservation_id')
      .eq('table_number', table_number)
      .maybeSingle();

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const allTableNumbers = [table_number];
    if (table.merged_into_table) {
      allTableNumbers.push(table.merged_into_table);
    }
    const { data: children } = await supabase
      .from('table_floors')
      .select('table_number')
      .eq('merged_into_table', table.table_number);
    if (children) {
      children.forEach(t => allTableNumbers.push(t.table_number));
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

    const resId = table.reservation_id;
    if (resId) {
      await supabase
        .from('reservations')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', resId);
    }

    return NextResponse.json({ success: true, table_number });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
