import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, createTransactionLog } from '@/lib/transaction';
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
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const body = await request.json();
    const { ids, id, status, suggested_ingredient_id, notes } = body;
    const targetIds = ids || (id ? [id] : []);
    if (!targetIds.length) return NextResponse.json({ error: 'id(s) required' }, { status: 400 });

    const targetStatus = status || 'approved';

    const { data: reviews } = await supabase
      .from('procurement_reviews')
      .select('*')
      .in('id', targetIds);

    if (!reviews?.length) return NextResponse.json({ error: 'Reviews not found' }, { status: 404 });

    for (const review of reviews) {
      if (review.status !== 'pending') {
        return NextResponse.json({ error: `Review ${review.id} is already ${review.status}` }, { status: 409 });
      }
    }

    const update: any = { status: targetStatus };
    if (suggested_ingredient_id) update.suggested_ingredient_id = suggested_ingredient_id;
    if (notes !== undefined) update.notes = notes;

    const stockOps = reviews.filter(r =>
      (targetStatus === 'approved' || targetStatus === 'mapped') && r.suggested_ingredient_id
    );

    const isRollback = targetStatus === 'rolled_back';

    const stockSnapshots: { review_id: string; ingredient_id: string; stock_before: number }[] = [];

    if (isRollback) {
      const { data: poOrders } = await supabase
        .from('purchase_orders')
        .select('id, status')
        .in('id', [...new Set(reviews.map(r => r.purchase_order_id).filter(Boolean))]);
      await withTransaction([
        {
          name: 'rollback_reviews',
          execute: async () => {
            for (const r of reviews) {
              if (r.suggested_ingredient_id) {
                const { data: ing } = await supabase
                  .from('ingredients')
                  .select('current_stock')
                  .eq('id', r.suggested_ingredient_id)
                  .single();
                if (ing) {
                  stockSnapshots.push({ review_id: r.id, ingredient_id: r.suggested_ingredient_id, stock_before: ing.current_stock });
                  const newQty = Math.max(0, (ing.current_stock || 0) - r.quantity);
                  await supabase.from('ingredients').update({ current_stock: newQty }).eq('id', r.suggested_ingredient_id);
                  await supabase.from('inventory_logs').insert({
                    ingredient_id: r.suggested_ingredient_id,
                    type: 'stock_out',
                    quantity: -r.quantity,
                    reason: `Rollback: ${r.product_name}`,
                  });
                }
              }
              await supabase.from('procurement_reviews').update({ status: 'rolled_back' }).eq('id', r.id);
            }
          },
          rollback: async () => {
            for (const snap of stockSnapshots) {
              await supabase.from('ingredients').update({ current_stock: snap.stock_before }).eq('id', snap.ingredient_id);
            }
            await supabase.from('procurement_reviews').update({ status: 'approved' }).in('id', targetIds);
          },
        },
      ]);
      return NextResponse.json({ success: true, rolled_back: reviews.length });
    }

    await withTransaction([
      {
        name: 'update_reviews',
        execute: async () => {
          const { error } = await supabase.from('procurement_reviews').update(update).in('id', targetIds);
          if (error) throw error;
        },
        rollback: async () => {
          await supabase.from('procurement_reviews').update({ status: 'pending' }).in('id', targetIds);
        },
      },
      ...(stockOps.length > 0 ? [{
        name: 'update_stock',
        execute: async () => {
          for (const r of stockOps) {
            const { data: ing } = await supabase
              .from('ingredients')
              .select('current_stock')
              .eq('id', r.suggested_ingredient_id)
              .single();
            if (!ing) continue;
            stockSnapshots.push({ review_id: r.id, ingredient_id: r.suggested_ingredient_id, stock_before: ing.current_stock });

            const newQty = (ing.current_stock || 0) + r.quantity;
            await supabase.from('ingredients').update({ current_stock: newQty }).eq('id', r.suggested_ingredient_id);
            await supabase.from('inventory_logs').insert({
              ingredient_id: r.suggested_ingredient_id,
              type: 'stock_in',
              quantity: r.quantity,
              cost_per_unit: r.unit_cost,
              reason: `Review approved: ${r.product_name}`,
            });
          }
        },
        rollback: async () => {
          for (const snap of stockSnapshots) {
            await supabase.from('ingredients').update({ current_stock: snap.stock_before }).eq('id', snap.ingredient_id);
          }
        },
      }] : []),
      {
        name: 'update_po_status',
        execute: async () => {
          const approvedCount = reviews.filter(r =>
            (targetStatus === 'approved' || targetStatus === 'mapped') && r.suggested_ingredient_id
          ).length;
          if (approvedCount > 0) {
            const poIds = [...new Set(reviews.map(r => r.purchase_order_id).filter(Boolean))];
            for (const poId of poIds) {
              const { data: po } = await supabase.from('purchase_orders').select('status').eq('id', poId).single();
              if (po && po.status !== 'received') {
                await supabase.from('purchase_orders').update({ status: 'partial' }).eq('id', poId);
              }
            }
          }
        },
        rollback: async () => {},
      },
    ]);

    await createTransactionLog('review_approve', 'completed', JSON.stringify({
      ids: targetIds, status: targetStatus, count: reviews.length
    }));

    return NextResponse.json({ success: true, count: reviews.length });
  } catch (e: any) {
    await createTransactionLog('review_approve', 'failed', e.message).catch(() => {});
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
