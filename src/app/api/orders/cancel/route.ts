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
      .select('id')
      .eq('table_number', tableNumber)
      .neq('status', 'paid');

    if (fetchErr) throw fetchErr;

    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);

      // Cancel all order items
      await supabase
        .from('order_items')
        .update({ kitchen_status: 'cancelled' })
        .in('order_id', orderIds);

      // Cancel orders (no loss record — just cleanup)
      await supabase
        .from('orders')
        .update({ status: 'cancelled', kitchen_status: 'cancelled' })
        .in('id', orderIds);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
