import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;

  try {
    const supabase = await createAuthClient();
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

    // If there are active orders, cancel them — no stock reversal (loss = ingredient already consumed)
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

      for (const orderId of orderIds) {
        try {
          await supabase.rpc('transition_order_status', {
            p_order_id: orderId,
            p_new_status: 'cancelled',
          });
        } catch (e) {
          console.error('transition_order_status failed for loss', orderId, e);
        }
      }
    }

    // Clear table_floors status so table shows as available
    if (table_number) {
      await supabase
        .from('table_floors')
        .update({
          status: 'empty',
          guest_count: null,
          reservation_id: null,
          reservation_name: null,
          reservation_phone: null,
          reservation_time: null,
          merged_into_table: null,
        })
        .eq('table_number', table_number);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
