import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { PurchaseOrder, CreatePurchaseOrderPayload } from '@/types/inventory';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data as PurchaseOrder[]);
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
    const body = (await request.json()) as CreatePurchaseOrderPayload;
    const supabase = svc();

    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const totalAmount = body.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({
        supplier_id: body.supplier_id,
        order_number: orderNumber,
        status: 'draft',
        total_amount: totalAmount,
        notes: body.notes || null,
        ordered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const items = body.items.map((item) => ({
      purchase_order_id: order.id,
      ingredient_id: item.ingredient_id || null,
      product_name: item.product_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost: item.unit_cost,
      total_cost: item.quantity * item.unit_cost,
    }));

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(items);

    if (itemsError) throw itemsError;

    // increment supplier total_orders
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('total_orders')
      .eq('id', body.supplier_id)
      .single();
    if (supplier) {
      await supabase
        .from('suppliers')
        .update({ total_orders: (supplier.total_orders || 0) + 1 })
        .eq('id', body.supplier_id);
    }

    return NextResponse.json(order);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
