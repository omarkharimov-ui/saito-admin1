import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

/**
 * POST /api/orders/void
 * Void items — cashier mistake, item never left kitchen.
 * Unlike Cancel (entire order) and Loss (prepared but not served),
 * Void reverses stock because ingredient was never consumed.
 *
 * Body: {
 *   order_id: string,
 *   items: [{ order_item_id: string, quantity: number }]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createAuthClient();
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { order_id, items } = await req.json();
    if (!order_id || !items?.length) {
      return NextResponse.json({ error: 'order_id and items required' }, { status: 400 });
    }

    // 1. Reverse stock for voided items (stock was deducted if ready)
    const reversalPayload = items.map((i: any) => ({
      order_item_id: i.order_item_id,
      reverse_qty: i.quantity,
    }));

    const { error: rpcErr } = await supabase.rpc('reverse_stock_deduction_for_items', {
      p_items: JSON.stringify(reversalPayload),
    });
    if (rpcErr) {
      console.error('[VOID] Stock reversal failed:', rpcErr);
      throw new Error('Stock reversal failed — void aborted to prevent inventory loss');
    }

    // 2. Delete or reduce voided items
    for (const item of items) {
      const { data: orderItem } = await supabase
        .from('order_items')
        .select('quantity')
        .eq('id', item.order_item_id)
        .single();

      if (!orderItem) continue;

      if (item.quantity >= orderItem.quantity) {
        await supabase.from('order_items').delete().eq('id', item.order_item_id);
      } else {
        const newQty = orderItem.quantity - item.quantity;
        const { data: oi } = await supabase
          .from('order_items')
          .select('unit_price')
          .eq('id', item.order_item_id)
          .single();
        await supabase
          .from('order_items')
          .update({
            quantity: newQty,
            total_price: (oi?.unit_price || 0) * newQty,
          })
          .eq('id', item.order_item_id);
      }
    }

    // 3. Record as void in cancelled_orders
    await supabase.from('cancelled_orders').insert({
      order_id,
      reason: 'void',
      reason_text: 'Kassir tərəfindən ləğv edildi (Void)',
      items: items.map((i: any) => ({
        order_item_id: i.order_item_id,
        quantity: i.quantity,
      })),
      created_at: new Date().toISOString(),
    });

    // 4. Recalculate order total
    const { data: remainingItems } = await supabase
      .from('order_items')
      .select('total_price')
      .eq('order_id', order_id);

    const newTotal = (remainingItems || []).reduce(
      (sum: number, i: any) => sum + Number(i.total_price || 0),
      0
    );

    await supabase
      .from('orders')
      .update({
        total_amount: Math.max(0, newTotal),
        kitchen_status: 'pending',
      })
      .eq('id', order_id);

    return NextResponse.json({
      success: true,
      voided_items: items.length,
      new_total: newTotal,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
