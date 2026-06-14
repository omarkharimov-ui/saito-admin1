import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { table_number, reason, reason_text, total_amount, note, order_ids, items } = body;

    if (!table_number || !reason) {
      return NextResponse.json({ error: 'table_number and reason required' }, { status: 400 });
    }

    // Record in cancelled_orders
    await supabase.from('cancelled_orders').insert({
      order_id: order_ids?.[0] || null,
      table_number,
      reason,
      reason_text: reason_text || reason,
      total_amount,
      items: items || [],
      created_at: new Date().toISOString(),
    });

    // If there are active orders, cancel them too
    const { data: orders } = await supabase
      .from('orders')
      .select('id')
      .eq('table_number', table_number)
      .neq('status', 'paid');

    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);

      await supabase
        .from('order_items')
        .update({ kitchen_status: 'cancelled' })
        .in('order_id', orderIds);

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
