import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, createTransactionLog } from '@/lib/transaction';
import { canTransitionInvoice } from '@/types/inventory';
import type { InvoiceStatus } from '@/types/inventory';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
    if (!canTransitionInvoice(currentStatus, 'rolled_back')) {
      return NextResponse.json({
        error: `Cannot rollback invoice in status "${currentStatus}". Only applied, approved, or partially_applied invoices can be rolled back.`
      }, { status: 409 });
    }

    const items = invoice.invoice_items || [];
    const rolledBackEntries: any[] = [];

    const { data: inventoryLogs } = await supabase
      .from('inventory_logs')
      .select('ingredient_id, quantity, id')
      .eq('order_id', invoice.purchase_order_id)
      .eq('type', 'stock_in')
      .gte('created_at', invoice.applied_at || invoice.created_at);

    await withTransaction([
      {
        name: 'reverse_stock',
        execute: async () => {
          for (const log of (inventoryLogs || [])) {
            const { data: ing } = await supabase
              .from('ingredients')
              .select('current_stock')
              .eq('id', log.ingredient_id)
              .single();
            if (!ing) continue;

            rolledBackEntries.push({ ingredient_id: log.ingredient_id, qty: log.quantity, stock_before: ing.current_stock });

            const newQty = Math.max(0, (ing.current_stock || 0) - log.quantity);
            await supabase.from('ingredients').update({ current_stock: newQty }).eq('id', log.ingredient_id);
            await supabase.from('inventory_logs').insert({
              ingredient_id: log.ingredient_id,
              type: 'stock_out',
              quantity: -log.quantity,
              reason: `Invoice rollback: ${invoice.invoice_number}`,
              order_id: invoice.purchase_order_id,
            });
          }
        },
        rollback: async () => {
          for (const entry of rolledBackEntries) {
            await supabase.from('ingredients').update({ current_stock: entry.stock_before }).eq('id', entry.ingredient_id);
          }
        },
      },
      {
        name: 'update_invoice',
        execute: async () => {
          await supabase.from('invoices').update({
            status: 'rolled_back',
            applied_at: null,
          }).eq('id', id);
        },
        rollback: async () => {
          await supabase.from('invoices').update({ status: currentStatus }).eq('id', id);
        },
      },
      {
        name: 'create_alert',
        execute: async () => {
          await supabase.from('discrepancy_alerts').insert({
            type: 'received_qty' as any,
            severity: 'high',
            title: `Invoice ${invoice.invoice_number} geri alındı`,
            description: `${rolledBackEntries.length} maddə üzrə stok geri çəkildi. Invoice ID: ${id}`,
            source_id: id,
            source_table: 'invoices',
            value: rolledBackEntries.length,
            expected_value: 0,
            variance_pct: 100,
          });
        },
        rollback: async () => {},
      },
    ]);

    await createTransactionLog('rollback_invoice', 'completed', JSON.stringify({
      invoiceId: id, reversedItems: rolledBackEntries.length
    }));

    return NextResponse.json({ success: true, rolled_back_items: rolledBackEntries.length });
  } catch (e: any) {
    await createTransactionLog('rollback_invoice', 'failed', e.message).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
