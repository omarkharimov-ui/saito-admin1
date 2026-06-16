import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchaseOrderId, items } = body;
    // items: { id: string, received_quantity: number }[]

    if (!purchaseOrderId || !items || !items.length) {
      return NextResponse.json({ error: 'purchaseOrderId and items required' }, { status: 400 });
    }

    const supabase = svc();

    // get PO items with ingredient info
    const { data: poItems, error: fetchError } = await supabase
      .from('purchase_order_items')
      .select('*, ingredients!left(name)')
      .eq('purchase_order_id', purchaseOrderId);

    if (fetchError) throw fetchError;
    if (!poItems || !poItems.length) {
      return NextResponse.json({ error: 'Purchase order has no items' }, { status: 400 });
    }

    const itemMap = new Map(poItems.map(i => [i.id, i]));
    let allFullyReceived = true;
    const logs: { ingredient_id: string; quantity: number; cost_per_unit: number; reason: string }[] = [];
    const stockUpdates: { id: string; current_stock: number; addQty: number }[] = [];

    for (const item of items) {
      const poItem = itemMap.get(item.id);
      if (!poItem) continue;

      const newReceived = Number(item.received_quantity) || 0;
      const previousReceived = Number(poItem.received_quantity) || 0;
      const orderedQty = Number(poItem.quantity) || 0;
      const diff = newReceived - previousReceived;

      if (diff <= 0) continue;

      // update received_quantity
      await supabase
        .from('purchase_order_items')
        .update({ received_quantity: newReceived })
        .eq('id', item.id);

      if (newReceived < orderedQty) allFullyReceived = false;

      // If linked to an ingredient, create stock-in log
      if (poItem.ingredient_id) {
        logs.push({
          ingredient_id: poItem.ingredient_id,
          quantity: diff,
          cost_per_unit: Number(poItem.unit_cost) || 0,
          reason: `Tədarük qəbulu: ${poItem.product_name} (${poItem.purchase_order_id?.substring(0, 8)}...)`,
        });
        stockUpdates.push({ id: poItem.ingredient_id, current_stock: 0, addQty: diff });
      }
    }

    // create inventory_logs entries
    if (logs.length > 0) {
      const { error: logError } = await supabase.from('inventory_logs').insert(
        logs.map(l => ({
          ingredient_id: l.ingredient_id,
          type: 'stock_in',
          quantity: l.quantity,
          cost_per_unit: l.cost_per_unit,
          reason: l.reason,
        }))
      );
      if (logError) throw logError;

      // update current_stock
      for (const s of stockUpdates) {
        const { data: ing } = await supabase
          .from('ingredients')
          .select('current_stock')
          .eq('id', s.id)
          .single();
        if (ing) {
          await supabase
            .from('ingredients')
            .update({ current_stock: Number(ing.current_stock) + s.addQty })
            .eq('id', s.id);
        }
      }
    }

    // update PO status
    const newStatus = allFullyReceived ? 'received' : 'partial';
    await supabase
      .from('purchase_orders')
      .update({
        status: newStatus,
        received_at: allFullyReceived ? new Date().toISOString() : null,
      })
      .eq('id', purchaseOrderId);

    return NextResponse.json({
      success: true,
      status: newStatus,
      updatedItems: items.length,
      stockUpdated: logs.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
