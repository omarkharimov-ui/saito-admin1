import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, createTransactionLog } from '@/lib/transaction';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = svc();
    const { purchaseOrderId, invoiceImage, manualItems } = await request.json();

    if (!purchaseOrderId) {
      return NextResponse.json({ error: 'purchaseOrderId required' }, { status: 400 });
    }

    const { data: po } = await supabase
      .from('purchase_orders')
      .select('*, supplier:supplier_id(name)')
      .eq('id', purchaseOrderId)
      .single();
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

    const { data: poItems } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', purchaseOrderId);
    if (!poItems?.length) {
      return NextResponse.json({ error: 'PO has no items' }, { status: 400 });
    }

    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, name, unit, current_stock, average_cost_per_unit, purchase_price');

    let invoice = null;
    let invoiceItems: any[] = [];

    if (invoiceImage) {
      const ocrRes = await fetch(`${request.nextUrl.origin}/api/invoice-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: invoiceImage, language: 'az' }),
      });
      if (ocrRes.ok) {
        const ocrData = await ocrRes.json();
        invoiceItems = (ocrData.lines || []).map((l: any) => ({
          product_name: l.name,
          quantity: l.quantity || 0,
          unit: l.unit || 'gram',
          unit_cost: l.unit_cost || 0,
          total_cost: l.total_cost || 0,
        }));
        if (ocrData.supplierName || ocrData.invoiceNumber || ocrData.totalAmount) {
          const { data: inv } = await supabase.from('invoices').insert({
            supplier_id: po.supplier_id || null,
            purchase_order_id: po.id,
            invoice_number: ocrData.invoiceNumber || `OCR-${Date.now()}`,
            total_amount: ocrData.totalAmount || 0,
            status: 'draft',
            ocr_raw: ocrData,
          }).select().single();
          invoice = inv;
        }
      }
    }

    if (manualItems?.length) {
      invoiceItems = manualItems;
    }

    if (!invoiceItems.length) {
      invoiceItems = poItems.map(i => ({
        product_name: i.product_name,
        quantity: i.quantity,
        unit: i.unit,
        unit_cost: i.unit_cost,
        total_cost: i.total_cost,
      }));
    }

    const autoStockUpdates: { ingredient_id: string; quantity: number; cost_per_unit: number; stock_before: number }[] = [];
    const reviews: any[] = [];
    const oldIngredientSnapshots: Record<string, number> = {};

    for (const item of invoiceItems) {
      const matchRes = await fetch(`${request.nextUrl.origin}/api/procurement/match-ingredient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: item.product_name }),
      });
      const matchData = await matchRes.json();

      if (matchData?.match?.confidence >= 0.7) {
        const ing = (ingredients || []).find(i => i.id === matchData.match.id);
        const stockBefore = ing?.current_stock || 0;
        oldIngredientSnapshots[matchData.match.id] = stockBefore;
        autoStockUpdates.push({
          ingredient_id: matchData.match.id,
          quantity: item.quantity || 0,
          cost_per_unit: item.unit_cost || 0,
          stock_before: stockBefore,
        });
      } else {
        reviews.push({
          purchase_order_id: po.id,
          invoice_id: invoice?.id || null,
          product_name: item.product_name || 'Unknown',
          quantity: item.quantity || 0,
          unit: item.unit || 'piece',
          unit_cost: item.unit_cost || 0,
          suggested_ingredient_id: matchData?.match?.id || null,
          match_confidence: matchData?.match?.confidence || null,
          status: 'pending',
        });
      }
    }

    const oldPoStatus = po.status;
    const oldItemReceived: Record<string, number> = {};
    for (const pi of poItems) {
      oldItemReceived[pi.id] = pi.received_quantity;
    }

    const allMatched = autoStockUpdates.length;
    const totalItems = invoiceItems.length;

    const result = await withTransaction([
      {
        name: 'update_stock',
        execute: async () => {
          for (const upd of autoStockUpdates) {
            const newQty = upd.stock_before + upd.quantity;
            await supabase.from('ingredients').update({ current_stock: newQty }).eq('id', upd.ingredient_id);
            await supabase.from('inventory_logs').insert({
              ingredient_id: upd.ingredient_id,
              type: 'stock_in',
              quantity: upd.quantity,
              cost_per_unit: upd.cost_per_unit,
              reason: `Auto-receive from PO ${po.order_number || po.id.slice(0, 8)}`,
              order_id: po.id,
            });
          }
        },
        rollback: async () => {
          for (const upd of autoStockUpdates) {
            await supabase.from('ingredients').update({ current_stock: upd.stock_before }).eq('id', upd.ingredient_id);
          }
        },
      },
      {
        name: 'insert_reviews',
        execute: async () => {
          if (reviews.length > 0) {
            await supabase.from('procurement_reviews').insert(reviews);
          }
        },
        rollback: async () => {
          if (reviews.length > 0) {
            const productNames = reviews.map((r: any) => r.product_name);
            await supabase.from('procurement_reviews').delete().in('product_name', productNames);
          }
        },
      },
      {
        name: 'update_po',
        execute: async () => {
          let poStatus = oldPoStatus;
          if (allMatched === totalItems) poStatus = 'received';
          else if (allMatched > 0) poStatus = 'partial';
          await supabase.from('purchase_orders').update({
            status: poStatus,
            received_at: new Date().toISOString(),
          }).eq('id', po.id);

          const poItemMap = new Map(poItems.map(i => [i.product_name.toLowerCase().trim(), i]));
          for (const item of invoiceItems) {
            const existing = poItemMap.get(item.product_name.toLowerCase().trim());
            if (existing) {
              const itemQty = item.quantity || 0;
            const receivedQty = Math.min(itemQty, (oldItemReceived[existing.id] || 0) + itemQty);
              await supabase.from('purchase_order_items').update({ received_quantity: receivedQty }).eq('id', existing.id);
            }
          }
        },
        rollback: async () => {
          await supabase.from('purchase_orders').update({ status: oldPoStatus, received_at: null }).eq('id', po.id);
          for (const pi of poItems) {
            await supabase.from('purchase_order_items').update({ received_quantity: oldItemReceived[pi.id] }).eq('id', pi.id);
          }
        },
      },
    ]);

    await createTransactionLog('receive_goods', 'completed', JSON.stringify({
      poId: purchaseOrderId, matched: allMatched, total: totalItems, reviews: reviews.length
    }));

    return NextResponse.json({
      success: true,
      po_status: result.results[2]?.status || oldPoStatus,
      auto_matched: allMatched,
      total_items: totalItems,
      review_items: reviews.length,
      invoice_id: invoice?.id || null,
    });
  } catch (e: any) {
    await createTransactionLog('receive_goods', 'failed', e.message).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
