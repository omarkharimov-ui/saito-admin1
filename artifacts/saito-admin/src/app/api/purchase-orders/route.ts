import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { PurchaseOrder, CreatePurchaseOrderPayload } from '@/types/inventory';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

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
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

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
        // 13c: recurring flag → the Monday cron (create_recurring_draft_pos)
        // drafts a copy; the order itself is a normal draft.
        recurring_weekly: body.recurring_weekly === true,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Deterministic ingredient binding: exact (case-insensitive) catalog name
    // match — receiving later then needs no AI/fuzzy step.
    const { data: allIngredients } = await supabase.from('ingredients').select('id, name');
    const byName = new Map<string, string>();
    for (const ing of allIngredients || []) byName.set(ing.name.toLowerCase(), ing.id);

    const items = body.items.map((item) => ({
      purchase_order_id: order.id,
      ingredient_id: item.ingredient_id || byName.get(item.product_name.toLowerCase().trim()) || null,
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

    // 11g (freeze audit): the old read-then-write increment lost updates
    // under concurrent PO creation. Atomic DB increment; a counter drift is
    // non-critical (bookkeeping) so it must not fail the create — but it is
    // logged instead of swallowed silently.
    const { error: incError } = await supabase.rpc('increment_supplier_orders', { p_supplier_id: body.supplier_id });
    if (incError) console.error('[purchase-orders] supplier total_orders increment failed:', incError.message);

    return NextResponse.json(order);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
