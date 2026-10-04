import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c (Toast invoice-automation flagship, SAITO variant): the invoice OCR →
// match → review chain already existed but REQUIED a pre-existing PO. This
// endpoint closes the Toast gap: a bare invoice (no PO) becomes a DRAFT PO
// the owner can review, edit and send. No auto-send — the human gate stays.
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface Line { product_name: string; quantity: number; unit?: string; unit_cost?: number; }

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const body = await request.json();
    const { supplier_id, items, notes, source } = body as {
      supplier_id?: string | null;
      items: Line[];
      notes?: string;
      source?: string;
    };
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items boş ola bilməz' }, { status: 400 });
    }

    const supabase = svc();
    const orderNumber = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const totalAmount = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);

    // A supplier is required to send/track a PO — fall back to the single
    // existing supplier when the invoice didn't name one (1-supplier reality).
    let supplierId = supplier_id ?? null;
    if (!supplierId) {
      const { data: sups } = await supabase.from('suppliers').select('id').order('name').limit(1);
      supplierId = sups?.[0]?.id ?? null;
    }
    if (!supplierId) return NextResponse.json({ error: 'supplier tapılmadı — əvvəl tədarükçü yarat' }, { status: 400 });

    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({
        supplier_id: supplierId,
        order_number: orderNumber,
        status: 'draft',
        total_amount: totalAmount,
        notes: notes || (source ? `Invoice-dan yaradıldı: ${source}` : 'Invoice-dan yaradıldı'),
        ordered_at: new Date().toISOString(),
        recurring_weekly: false,
      })
      .select()
      .single();
    if (orderError) throw orderError;

    const { data: allIngredients } = await supabase.from('ingredients').select('id, name');
    const byName = new Map<string, string>();
    for (const ing of allIngredients ?? []) byName.set(ing.name.toLowerCase(), ing.id);

    const poItems = items.map((item) => ({
      purchase_order_id: order.id,
      ingredient_id: byName.get((item.product_name || '').toLowerCase().trim()) || null,
      product_name: item.product_name,
      quantity: item.quantity || 0,
      unit: item.unit || null,
      unit_cost: item.unit_cost || 0,
      total_cost: (item.quantity || 0) * (item.unit_cost || 0),
    }));
    const { error: itemsError } = await supabase.from('purchase_order_items').insert(poItems);
    if (itemsError) throw itemsError;

    return NextResponse.json({ success: true, purchase_order: order, lines: poItems.length }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
