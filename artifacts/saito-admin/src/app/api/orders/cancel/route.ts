import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const { searchParams } = new URL(req.url);
    const tableNumber = parseInt(searchParams.get('table_number') || '', 10);
    if (!tableNumber) {
      return NextResponse.json({ error: 'table_number required' }, { status: 400 });
    }

    const { data: orders, error: fetchErr } = await supabase
      .from('orders')
      .select('id')
      .eq('table_number', tableNumber)
      .neq('status', 'paid');

    if (fetchErr) throw fetchErr;

    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);

      // Item-level stock reversal — reverse all non-served items
      const { data: items } = await supabase
        .from('order_items')
        .select('id, quantity')
        .in('order_id', orderIds)
        .not('kitchen_status', 'eq', 'cancelled')
        .or('served_quantity.is.null,served_quantity.eq.0');

      if (items && items.length > 0) {
        const reversalPayload = items.map(i => ({
          order_item_id: i.id,
          reverse_qty: i.quantity,
        }));
        await supabase.rpc('reverse_stock_deduction_for_items', {
          p_items: JSON.stringify(reversalPayload),
        });
      }

      await supabase
        .from('order_items')
        .update({ kitchen_status: 'cancelled' })
        .in('order_id', orderIds);

      await supabase
        .from('orders')
        .update({ status: 'cancelled', kitchen_status: 'cancelled' })
        .in('id', orderIds);
    }

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
      .eq('table_number', tableNumber);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
