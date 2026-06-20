import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, createTransactionLog } from '@/lib/transaction';
import { canTransitionInvoice } from '@/types/inventory';
import type { InvoiceStatus } from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = svc();

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const currentStatus = invoice.status as InvoiceStatus;
    if (!canTransitionInvoice(currentStatus, 'applied')) {
      return NextResponse.json({
        error: `Cannot apply invoice in status "${currentStatus}". Only approved or matched invoices can be applied.`
      }, { status: 409 });
    }

    const items = invoice.invoice_items || [];
    const stockSnapshots: { ingredient_id: string; stock_before: number }[] = [];

    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, name, current_stock');

    await withTransaction([
      {
        name: 'update_stock',
        execute: async () => {
          for (const item of items) {
            if (!item.matched) continue;

            let ingredientId: string | null = null;
            let unitCost = item.unit_cost;

            if (item.purchase_order_item_id) {
              const { data: poItem } = await supabase
                .from('purchase_order_items')
                .select('ingredient_id')
                .eq('id', item.purchase_order_item_id)
                .single();
              if (poItem?.ingredient_id) ingredientId = poItem.ingredient_id;
            }

            if (!ingredientId) {
              const matchRes = await fetch(`${_?.url || ''}/api/procurement/match-ingredient`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productName: item.product_name }),
              });
              if (matchRes.ok) {
                const match = await matchRes.json();
                if (match.match) ingredientId = match.match.id;
              }
            }

            if (!ingredientId) continue;

            const ing = (ingredients || []).find(i => i.id === ingredientId);
            const stockBefore = ing?.current_stock || 0;
            stockSnapshots.push({ ingredient_id: ingredientId, stock_before: stockBefore });

            const newQty = stockBefore + item.quantity;
            await supabase.from('ingredients').update({ current_stock: newQty }).eq('id', ingredientId);
            await supabase.from('inventory_logs').insert({
              ingredient_id: ingredientId,
              type: 'stock_in',
              quantity: item.quantity,
              cost_per_unit: unitCost,
              reason: `Invoice apply: ${invoice.invoice_number} / ${item.product_name}`,
              order_id: invoice.purchase_order_id,
            });
          }
        },
        rollback: async () => {
          for (const snap of stockSnapshots) {
            await supabase.from('ingredients').update({ current_stock: snap.stock_before }).eq('id', snap.ingredient_id);
          }
        },
      },
      {
        name: 'update_invoice',
        execute: async () => {
          await supabase.from('invoices').update({
            status: 'applied',
            applied_at: new Date().toISOString(),
          }).eq('id', id);
        },
        rollback: async () => {
          await supabase.from('invoices').update({ status: currentStatus, applied_at: null }).eq('id', id);
        },
      },
    ]);

    await createTransactionLog('apply_invoice', 'completed', JSON.stringify({
      invoiceId: id, appliedItems: items.filter((i: any) => i.matched).length
    }));

    return NextResponse.json({ success: true, applied_items: stockSnapshots.length });
  } catch (e: any) {
    await createTransactionLog('apply_invoice', 'failed', e.message).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
