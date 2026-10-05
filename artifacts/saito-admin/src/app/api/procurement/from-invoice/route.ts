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
    const { supplier_id, supplier_name, items, notes, source } = body as {
      supplier_id?: string | null;
      supplier_name?: string | null;
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

    // 13e: supplier resolution — NEVER silently mis-attribute.
    // Order: explicit supplier_id → OCR supplier_name match (exact > prefix >
    // contains, matched in JS so invoice names with commas can't break a
    // PostgREST `.or()`) → canonical "Naməlum Tədarükçü" (find-or-create).
    // The old code fell back to the alphabetically-FIRST supplier (coca cola
    // baku), so a sushi-ingredient invoice got silently tagged to the wrong
    // supplier — polluting supplier score / total_orders.
    const FALLBACK_SUPPLIER = 'Naməlum Tədarükçü';
    let supplierId = supplier_id ?? null;
    if (!supplierId && supplier_name) {
      const q = String(supplier_name).trim().toLowerCase();
      if (q) {
        const { data: sups } = await supabase.from('suppliers').select('id, name');
        const list = (sups ?? []).map(s => ({ id: s.id, name: String(s.name ?? '').trim().toLowerCase() }));
        const exact = list.find(s => s.name === q);
        const start = list.find(s => s.name.startsWith(q));
        const cont = list.find(s => s.name.includes(q));
        supplierId = (exact || start || cont)?.id ?? null;
      }
    }
    if (!supplierId) {
      const { data: fb } = await supabase.from('suppliers').select('id').eq('name', FALLBACK_SUPPLIER).limit(1);
      if (fb?.[0]) {
        supplierId = fb[0].id;
      } else {
        const { data: created, error: fbErr } = await supabase
          .from('suppliers').insert({ name: FALLBACK_SUPPLIER }).select('id').single();
        if (fbErr) throw fbErr;
        supplierId = created?.id ?? null;
      }
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

    // 13e: NOT NULL defenses — `unit` and `product_name` are NOT NULL on
    // purchase_order_items. The old `unit: item.unit || null` 500'd on any
    // OCR line without a unit AND left the PO header committed (no rollback)
    // → orphan draft POs (E2E r29). Default unit like /procurement/receive.
    const poItems = items.map((item) => ({
      purchase_order_id: order.id,
      ingredient_id: byName.get((item.product_name || '').toLowerCase().trim()) || null,
      product_name: item.product_name || 'Naməlum məhsul',
      quantity: item.quantity || 0,
      unit: item.unit || 'gram',
      unit_cost: item.unit_cost || 0,
      total_cost: (item.quantity || 0) * (item.unit_cost || 0),
    }));
    const { error: itemsError } = await supabase.from('purchase_order_items').insert(poItems);
    if (itemsError) {
      // Compensate: the PO header is already committed — remove it (and any
      // partial items) so a failed line-insert never leaves an orphan PO.
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', order.id);
      await supabase.from('purchase_orders').delete().eq('id', order.id);
      throw itemsError;
    }

    return NextResponse.json({ success: true, purchase_order: order, lines: poItems.length }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
