import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function restoreStockForOrder(supabase: ReturnType<typeof svc>, orderId: string) {
  const shortId = orderId.slice(0, 8);
  const { data: logs } = await supabase
    .from('inventory_logs')
    .select('id, ingredient_id, quantity')
    .eq('type', 'order_consumption')
    .ilike('reason', `%${shortId}%`);

  if (!logs || logs.length === 0) return;

  const restoreLogs = logs.map(log => ({
    ingredient_id: log.ingredient_id,
    type: 'order_restore' as const,
    quantity: Math.abs(log.quantity),
    reason: `Ləğv olunmuş sifariş — #${shortId} (geri yazıldı)`,
  }));

  const { error } = await supabase.from('inventory_logs').insert(restoreLogs);
  if (error) console.error('[Cancel] Stock restore error:', error);
}

export async function DELETE(req: NextRequest) {
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

      // Restore stock before cancelling
      for (const id of orderIds) {
        await restoreStockForOrder(supabase, id);
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
      .from('tables')
      .update({
        status: 'empty',
        guest_count: null,
        opened_at: null,
        last_activity_at: null,
        total_amount: 0,
        merged_into_table: null,
      })
      .eq('table_number', tableNumber);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
