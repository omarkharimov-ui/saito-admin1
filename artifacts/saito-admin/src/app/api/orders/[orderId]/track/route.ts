import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        table_number,
        kitchen_status,
        kitchen_accepted_at,
        kitchen_ready_at,
        created_at,
        total_amount,
        order_items(
          id,
          product_name,
          quantity,
          prepared_quantity,
          kitchen_status,
          image_url
        )
      `)
      .eq('id', orderId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const items = (data.order_items || []).map((it: any) => ({
      id: it.id,
      product_name: it.product_name,
      quantity: it.quantity,
      prepared_quantity: it.prepared_quantity || 0,
      kitchen_status: it.kitchen_status || 'pending',
      image_url: it.image_url,
    }));

    return NextResponse.json({
      id: data.id,
      table_number: data.table_number,
      kitchen_status: data.kitchen_status,
      kitchen_accepted_at: data.kitchen_accepted_at,
      kitchen_ready_at: data.kitchen_ready_at,
      created_at: data.created_at,
      total_amount: data.total_amount,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
