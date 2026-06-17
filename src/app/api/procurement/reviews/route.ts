import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
    const { data } = await supabase
      .from('procurement_reviews')
      .select('*')
      .order('created_at', { ascending: false });
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = svc();
    const { id, status, suggested_ingredient_id, notes } = await request.json();

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const update: any = { status: status || 'approved' };
    if (suggested_ingredient_id) update.suggested_ingredient_id = suggested_ingredient_id;
    if (notes !== undefined) update.notes = notes;

    if (status === 'approved' || status === 'mapped') {
      const { data: review } = await supabase
        .from('procurement_reviews')
        .select('*')
        .eq('id', id)
        .single();

      if (review && review.suggested_ingredient_id) {
        const { data: ing } = await supabase
          .from('ingredients')
          .select('current_stock')
          .eq('id', review.suggested_ingredient_id)
          .single();

        if (ing) {
          const newQty = (ing.current_stock || 0) + review.quantity;
          await supabase.from('ingredients').update({ current_stock: newQty }).eq('id', review.suggested_ingredient_id);
          await supabase.from('inventory_logs').insert({
            ingredient_id: review.suggested_ingredient_id,
            type: 'stock_in',
            quantity: review.quantity,
            cost_per_unit: review.unit_cost,
            reason: `Review approved: ${review.product_name}`,
          });
        }

        const { data: po } = await supabase
          .from('purchase_orders')
          .select('status')
          .eq('id', review.purchase_order_id)
          .single();
        if (po && po.status !== 'received') {
          await supabase.from('purchase_orders').update({ status: 'partial' }).eq('id', review.purchase_order_id);
        }
      }
    }

    const { error } = await supabase.from('procurement_reviews').update(update).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
