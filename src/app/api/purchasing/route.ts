'use server';

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { PurchaseOrder, PurchaseOrderItem, Supplier, PurchasingAnalytics } from '@/types/purchasing';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const supabase = svc();

    const [suppliersRes, ordersRes, analyticsRes, ingredientsRes] = await Promise.all([
      supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('*, supplier:suppliers(*), items:purchase_order_items(*)').order('created_at', { ascending: false }),
      supabase.from('purchasing_analytics').select('*').maybeSingle(),
      supabase.from('ingredients').select('id, name, unit, current_stock, average_cost_per_unit, purchase_price').order('name'),
    ]);

    if (suppliersRes.error) throw suppliersRes.error;
    if (ordersRes.error) throw ordersRes.error;
    if (analyticsRes.error) throw analyticsRes.error;
    if (ingredientsRes.error) throw ingredientsRes.error;

    return NextResponse.json({
      suppliers: (suppliersRes.data || []) as Supplier[],
      orders: (ordersRes.data || []) as PurchaseOrder[],
      analytics: (analyticsRes.data || null) as PurchasingAnalytics | null,
      ingredients: ingredientsRes.data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = svc();
    const body = await req.json();
    const action = body.action as string;

    if (action === 'supplier_create') {
      const { data, error } = await supabase.from('suppliers').insert(body.payload).select().single();
      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    if (action === 'supplier_update') {
      const { id, ...payload } = body.payload || {};
      const { data, error } = await supabase.from('suppliers').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (action === 'purchase_order_create') {
      const { order, items } = body.payload || {};
      const { data: po, error: orderError } = await supabase.from('purchase_orders').insert(order).select('id').single();
      if (orderError) throw orderError;

      if (Array.isArray(items) && items.length > 0) {
        const inserts = items.map((item: any) => ({ ...item, purchase_order_id: po.id }));
        const { error: itemsError } = await supabase.from('purchase_order_items').insert(inserts);
        if (itemsError) throw itemsError;
      }

      const { data, error } = await supabase.from('purchase_orders').select('*, supplier:suppliers(*), items:purchase_order_items(*)').eq('id', po.id).single();
      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    if (action === 'receive_order') {
      const { purchase_order_id, lines, receipt_note, invoice_url } = body.payload || {};
      const receivedTotal = Array.isArray(lines)
        ? lines.reduce((sum: number, line: any) => sum + Number(line.quantity || 0) * Number(line.cost_per_unit || 0), 0)
        : 0;

      const { error: rpcError } = await supabase.rpc('receive_purchase_order', {
        p_purchase_order_id: purchase_order_id,
        p_lines: lines || [],
      });
      if (rpcError) throw rpcError;

      const updatePayload: Record<string, unknown> = { status: 'received', received_at: new Date().toISOString() };
      if (invoice_url) updatePayload.invoice_url = invoice_url;
      if (receipt_note) updatePayload.notes = receipt_note;
      if (receivedTotal) updatePayload.total = receivedTotal;
      const { error } = await supabase.from('purchase_orders').update(updatePayload).eq('id', purchase_order_id);
      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown purchasing action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = svc();
    const action = req.nextUrl.searchParams.get('action');
    const id = req.nextUrl.searchParams.get('id');

    if (!action || !id) return NextResponse.json({ error: 'action and id are required' }, { status: 400 });

    if (action === 'supplier_delete') {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'purchase_order_delete') {
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown delete action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
