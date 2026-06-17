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

async function aiMatchProduct(productName: string, origin: string): Promise<any> {
  try {
    const res = await fetch(`${origin}/api/procurement/match-ingredient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName }),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  return { match: null, candidates: [] };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = svc();

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), supplier:supplier_id(name)')
      .eq('id', id)
      .single();
    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const currentStatus = invoice.status as InvoiceStatus;
    if (!canTransitionInvoice(currentStatus, 'matched') && !canTransitionInvoice(currentStatus, 'needs_review')) {
      return NextResponse.json({
        error: `Cannot reconcile invoice in status "${currentStatus}". Only draft or needs_review invoices can be reconciled.`
      }, { status: 409 });
    }

    const invoiceItems = invoice.invoice_items || [];
    const anomalies: any[] = [];
    const marginImpacts: any[] = [];

    let poItems: any[] = [];
    if (invoice.purchase_order_id) {
      const { data: items } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', invoice.purchase_order_id);
      poItems = items || [];
    }

    const reconciledItems = await Promise.all(invoiceItems.map(async (invItem: any) => {
      if (poItems.length > 0) {
        const exact = poItems.find(
          (po: any) => po.product_name.toLowerCase().trim() === invItem.product_name.toLowerCase().trim()
        );
        if (exact) {
          return matchAndCheck(invItem, exact, anomalies, marginImpacts);
        }

        const aiResult = await aiMatchProduct(invItem.product_name, request.nextUrl.origin);
        if (aiResult.match && aiResult.match.confidence > 0.6) {
          const poMatch = poItems.find((p: any) => p.product_name === aiResult.match.name);
          if (poMatch) {
            return matchAndCheck(invItem, poMatch, anomalies, marginImpacts);
          }
        }
      }

      const aiResult = await aiMatchProduct(invItem.product_name, request.nextUrl.origin);
      const matchedIngredient = aiResult.match;

      if (matchedIngredient && matchedIngredient.confidence >= 0.7) {
        const { data: priceHistory } = await supabase
          .from('purchase_order_items')
          .select('unit_cost')
          .eq('ingredient_id', matchedIngredient.id)
          .order('created_at', { ascending: false })
          .limit(5);

        const expectedCost = priceHistory?.length
          ? priceHistory.reduce((s: number, p: any) => s + p.unit_cost, 0) / priceHistory.length
          : invItem.unit_cost;

        const costVar = expectedCost > 0 ? ((invItem.unit_cost - expectedCost) / expectedCost) * 100 : 0;
        if (Math.abs(costVar) > 5) {
          anomalies.push({
            product_name: invItem.product_name,
            invoice_unit_cost: invItem.unit_cost,
            expected_unit_cost: Math.round(expectedCost * 10000) / 10000,
            variance_pct: Math.round(costVar * 100) / 100,
            severity: Math.abs(costVar) > 20 ? 'high' : Math.abs(costVar) > 10 ? 'medium' : 'low',
          });
          marginImpacts.push({
            product_name: invItem.product_name,
            cost_increase_pct: Math.round(costVar * 100) / 100,
            estimated_margin_impact_pct: Math.round((costVar * 0.3) * 100) / 100,
          });
        }

        return {
          ...invItem,
          matched: true,
          variance_quantity: 0,
          variance_cost: costVar > 0 ? invItem.total_cost * (costVar / 100) : 0,
        };
      }

      return {
        ...invItem,
        matched: false,
        variance_quantity: invItem.quantity,
        variance_cost: invItem.total_cost,
      };
    }));

    const totalVariance = reconciledItems.reduce((s: number, i: any) => s + i.variance_cost, 0);
    const itemDiscrepancies = reconciledItems.filter((i: any) => !i.matched).length;

    let reconciledStatus: InvoiceStatus = 'matched';
    if (itemDiscrepancies > 0) reconciledStatus = 'needs_review';
    if (anomalies.length > 0 && itemDiscrepancies === 0) reconciledStatus = 'matched';
    if (totalVariance === 0 && itemDiscrepancies === 0 && anomalies.length === 0) reconciledStatus = 'matched';

    await withTransaction([
      {
        name: 'update_invoice_status',
        execute: async () => {
          await supabase.from('invoices').update({ status: reconciledStatus }).eq('id', id);
          if (reconciledItems.length > 0 && invoiceItems.length > 0) {
            for (const item of reconciledItems) {
              if (item.id) {
                await supabase.from('invoice_items').update({
                  matched: item.matched,
                  variance_quantity: item.variance_quantity || 0,
                  variance_cost: item.variance_cost || 0,
                }).eq('id', item.id);
              }
            }
          }
        },
        rollback: async () => {
          await supabase.from('invoices').update({ status: currentStatus }).eq('id', id);
        },
      },
      {
        name: 'create_alerts',
        execute: async () => {
          if (anomalies.length > 0) {
            const supplierName = (invoice as any).supplier?.name || 'Unknown';
            for (const a of anomalies) {
              await supabase.from('discrepancy_alerts').insert({
                type: 'supplier_price' as any,
                severity: a.severity,
                title: `${supplierName}: ${a.product_name} qiymət anomaliyası`,
                description: `Faktura qiyməti: ${a.invoice_unit_cost} AZN, gözlənilən: ${a.expected_unit_cost} AZN (${a.variance_pct > 0 ? '+' : ''}${a.variance_pct}%)`,
                source_id: id,
                source_table: 'invoices',
                value: a.invoice_unit_cost,
                expected_value: a.expected_unit_cost,
                variance_pct: a.variance_pct,
              });
            }
          }

          if (itemDiscrepancies > 0) {
            await supabase.from('discrepancy_alerts').insert({
              type: 'received_qty' as any,
              severity: itemDiscrepancies > 3 ? 'high' : 'medium',
              title: `${invoice.invoice_number}: ${itemDiscrepancies} uyğunsuz maddə`,
              description: `${itemDiscrepancies} invoice maddəsi PO ilə match edilə bilmədi. Manual review tələb olunur.`,
              source_id: id,
              source_table: 'invoices',
              value: itemDiscrepancies,
              expected_value: 0,
              variance_pct: 100,
            });
          }
        },
        rollback: async () => {},
      },
    ]);

    await createTransactionLog('reconcile_invoice', 'completed', JSON.stringify({
      invoiceId: id, status: reconciledStatus, anomalies: anomalies.length, discrepancies: itemDiscrepancies
    }));

    const { data: updatedInvoice } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();

    return NextResponse.json({
      invoice: updatedInvoice,
      items: reconciledItems,
      summary: {
        total_variance: totalVariance,
        item_discrepancies: itemDiscrepancies,
        price_anomalies: anomalies,
        margin_impact: marginImpacts,
      },
    });
  } catch (e: any) {
    await createTransactionLog('reconcile_invoice', 'failed', e.message).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function matchAndCheck(invItem: any, poItem: any, anomalies: any[], marginImpacts: any[]) {
  const varianceQuantity = invItem.quantity - poItem.quantity;
  const varianceCost = invItem.total_cost - poItem.total_cost;

  if (Math.abs(invItem.unit_cost - poItem.unit_cost) / poItem.unit_cost > 0.05) {
    const variancePct = ((invItem.unit_cost - poItem.unit_cost) / poItem.unit_cost) * 100;
    anomalies.push({
      product_name: invItem.product_name,
      invoice_unit_cost: invItem.unit_cost,
      expected_unit_cost: poItem.unit_cost,
      variance_pct: Math.round(variancePct * 100) / 100,
      severity: Math.abs(variancePct) > 20 ? 'high' : Math.abs(variancePct) > 10 ? 'medium' : 'low',
    });
    marginImpacts.push({
      product_name: invItem.product_name,
      cost_increase_pct: Math.round(variancePct * 100) / 100,
      estimated_margin_impact_pct: Math.round((variancePct * 0.3) * 100) / 100,
    });
  }

  return {
    ...invItem,
    purchase_order_item_id: poItem.id,
    matched: true,
    variance_quantity: varianceQuantity,
    variance_cost: varianceCost,
  };
}
