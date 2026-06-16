import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { PurchaseOrder, PurchaseOrderItem } from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = svc();

    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .single();
    if (orderError) throw orderError;

    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', id);
    if (itemsError) throw itemsError;

    return NextResponse.json({ ...order, items: items || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = svc();
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(body)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data as PurchaseOrder);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = svc();
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
