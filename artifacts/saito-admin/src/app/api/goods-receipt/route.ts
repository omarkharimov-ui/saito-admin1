import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { withTransaction, createTransactionLog } from '@/lib/transaction';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * POST /api/goods-receipt — Goods Receipt Note for a purchase order.
 * Body: { purchaseOrderId: string, items: [{ id: string, received_quantity: number }] }
 *
 * Delta semantics: `received_quantity` is the NEW cumulative total per PO item.
 * Only the delta over the previously recorded received_quantity is stocked
 * (re-submitting the same totals is a no-op; partial receives accumulate).
 *
 * Stock path: inventory_logs stock_in → DB triggers (trg_wac_on_stock_in = WAC
 * cost update, inventory effect = current_stock, unit-cost backfill).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { purchaseOrderId, items } = await request.json();
    if (!purchaseOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'purchaseOrderId and items[] are required' }, { status: 400 });
    }

    const supabase = svc();

    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id, order_number, status, supplier_id')
      .eq('id', purchaseOrderId)
      .maybeSingle();
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

    if (po.status === 'cancelled' || po.status === 'received') {
      return NextResponse.json({ error: `PO is ${po.status} — cannot receive` }, { status: 409 });
    }

    const { data: poItems } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', purchaseOrderId);
    if (!poItems?.length) {
      return NextResponse.json({ error: 'PO has no items' }, { status: 400 });
    }

    // Resolve ingredient for each item: stored ingredient_id first, then
    // exact (case-insensitive) name match against the catalog.
    const { data: allIngredients } = await supabase.from('ingredients').select('id, name');
    const byName = new Map<string, string>();
    for (const ing of allIngredients || []) byName.set(ing.name.toLowerCase(), ing.id);

    interface Receipt {
      poItemId: string;
      ingredientId: string | null;
      productName: string;
      oldTotal: number;
      newTotal: number;
      delta: number;
      unitCost: number;
    }

    const receipts: Receipt[] = [];
    const unmatched: string[] = [];
    const reqIds = new Set(items.map(i => i.id));

    for (const req of items) {
      const poItem = poItems.find(i => i.id === req.id);
      if (!poItem) continue;
      const newTotal = Math.max(0, Number(req.received_quantity) || 0);
      const oldTotal = Number(poItem.received_quantity) || 0;
      const delta = Math.round((newTotal - oldTotal) * 1000) / 1000;
      if (delta <= 0) continue;

      const ingredientId = poItem.ingredient_id || byName.get(poItem.product_name.toLowerCase().trim()) || null;
      if (!ingredientId) unmatched.push(poItem.product_name);
      receipts.push({
        poItemId: poItem.id,
        ingredientId,
        productName: poItem.product_name,
        oldTotal,
        newTotal,
        delta,
        unitCost: Number(poItem.unit_cost) || 0,
      });
    }

    if (receipts.length === 0) {
      return NextResponse.json({
        success: true,
        po_status: po.status,
        received_now: 0,
        total_items: poItems.length,
        unmatched,
        note: 'No new quantity to receive',
      });
    }

    // Final status: every PO item must be fully received (requested totals for
    // items in this receipt, current totals for the rest).
    const totalsAfter = new Map<string, { ordered: number; received: number }>();
    for (const pi of poItems) {
      totalsAfter.set(pi.id, {
        ordered: Number(pi.quantity) || 0,
        received: Number(pi.received_quantity) || 0,
      });
    }
    for (const r of receipts) totalsAfter.set(r.poItemId, { ordered: totalsAfter.get(r.poItemId)?.ordered || 0, received: r.newTotal });
    const allComplete = [...totalsAfter.values()].every(t => t.received >= t.ordered - 0.0001);
    const newStatus: 'received' | 'partial' = allComplete ? 'received' : 'partial';

    const stockable = receipts.filter(r => r.ingredientId);

    await withTransaction([
      {
        name: 'stock_in',
        execute: async () => {
          for (const r of stockable) {
            await supabase.from('inventory_logs').insert({
              ingredient_id: r.ingredientId,
              type: 'stock_in',
              quantity: r.delta,
              cost_per_unit: r.unitCost,
              reason: `Goods receipt ${po.order_number}`,
              order_id: po.id,
            });
          }
        },
        rollback: async () => {
          // Undo the inventory effect with a compensating negative adjustment
          // (inventory_log_type has no stock_out; adjustment passes the sign through).
          for (const r of stockable) {
            await supabase.from('inventory_logs').insert({
              ingredient_id: r.ingredientId,
              type: 'adjustment',
              quantity: -r.delta,
              cost_per_unit: r.unitCost,
              reason: `Goods receipt rollback ${po.order_number}`,
              order_id: po.id,
            });
          }
        },
      },
      {
        name: 'mark_received',
        execute: async () => {
          for (const r of receipts) {
            await supabase.from('purchase_order_items').update({ received_quantity: r.newTotal }).eq('id', r.poItemId);
          }
        },
        rollback: async () => {
          for (const r of receipts) {
            await supabase.from('purchase_order_items').update({ received_quantity: r.oldTotal }).eq('id', r.poItemId);
          }
        },
      },
      {
        name: 'update_po_status',
        execute: async () => {
          await supabase.from('purchase_orders').update({ status: newStatus, received_at: new Date().toISOString() }).eq('id', po.id);
        },
        rollback: async () => {
          await supabase.from('purchase_orders').update({ status: po.status, received_at: null }).eq('id', po.id);
        },
      },
    ]);

    await createTransactionLog('goods_receipt', 'completed', JSON.stringify({
      poId: po.id,
      orderNumber: po.order_number,
      received: receipts.map(r => ({ item: r.productName, delta: r.delta, total: r.newTotal })),
      unmatched,
      status: newStatus,
    })).catch(() => {});

    return NextResponse.json({
      success: true,
      po_status: newStatus,
      received_now: receipts.length,
      total_items: poItems.length,
      unmatched,
    });
  } catch (e: any) {
    await createTransactionLog('goods_receipt', 'failed', e.message).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
