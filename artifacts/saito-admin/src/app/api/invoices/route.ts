import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { CreateInvoicePayload } from '@/types/inventory';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const poId = searchParams.get('purchase_order_id');
    const status = searchParams.get('status');

    let query = supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (supplierId) query = query.eq('supplier_id', supplierId);
    if (poId) query = query.eq('purchase_order_id', poId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const body = (await request.json()) as CreateInvoicePayload;

    if (!body.supplier_id || !body.invoice_number) {
      return NextResponse.json({ error: 'supplier_id and invoice_number are required' }, { status: 400 });
    }

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        supplier_id: body.supplier_id,
        purchase_order_id: body.purchase_order_id || null,
        invoice_number: body.invoice_number,
        invoice_date: body.invoice_date || null,
        total_amount: body.total_amount,
        tax_amount: body.tax_amount || 0,
        currency: body.currency || 'AZN',
        notes: body.notes || null,
        ocr_raw: body.ocr_raw || null,
      })
      .select()
      .single();
    if (invError) throw invError;

    if (body.items?.length) {
      const items = body.items.map(item => ({
        invoice_id: invoice.id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
      }));
      const { error: itemError } = await supabase.from('invoice_items').insert(items);
      if (itemError) throw itemError;
    }

    const { data: fullInvoice } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoice.id)
      .single();

    return NextResponse.json(fullInvoice);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
