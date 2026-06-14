import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tableNumber = parseInt(searchParams.get('table_number') || '', 10);
    if (!tableNumber) {
      return NextResponse.json({ error: 'table_number required' }, { status: 400 });
    }

    // Find active orders for this table
    const { data: orders, error: fetchErr } = await supabase
      .from('orders')
      .select('id, merged_into')
      .eq('table_number', tableNumber)
      .neq('status', 'paid');

    if (fetchErr) throw fetchErr;

    const orderIds = (orders || []).map(o => o.id);
    const parentIds = orderIds.slice();

    if (orders && orders.length > 0) {
      const { data: childOrders, error: childErr } = await supabase
        .from('orders')
        .select('id')
        .in('merged_into', parentIds)
        .neq('status', 'paid');

      if (childErr) throw childErr;

      const idsToClear = [...orderIds, ...((childOrders || []).map(o => o.id))];

      if (idsToClear.length > 0) {
        await supabase.from('order_items').delete().in('order_id', idsToClear);
        await supabase.from('orders').delete().in('id', idsToClear);
      }
    }

    // Reset table status and guest count to empty
    await supabase
      .from('table_floors')
      .update({ merged_into_table: null })
      .eq('table_number', tableNumber);

    return NextResponse.json({ success: true, cleared_order_ids: orderIds });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
