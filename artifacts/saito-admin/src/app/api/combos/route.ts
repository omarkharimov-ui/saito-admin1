import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET() {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'cashier', 'kitchen']);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createAuthClient();
    const { data, error } = await supabase
      .from('combos')
      .select('*, items:combo_items(*, product:products(*))')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Həmçinin məhsulları da qaytarmalıyıq ki, frontend-də picker işləsin
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, name, price, image_url')
      .order('name');
    
    if (pErr) throw pErr;

    return NextResponse.json({
      combos: data || [],
      products: products || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { action, combo, items, id, data } = body;
    const supabase = await createAuthClient();

    if (action === 'update') {
      const { error } = await supabase.from('combos').update(data).eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Create New
    const { data: newCombo, error: cErr } = await supabase.from('combos').insert(combo).select().single();
    if (cErr) throw cErr;

    if (items && items.length > 0) {
      const comboItems = items.map((it: any) => ({
        combo_id: newCombo.id,
        product_id: it.product_id,
        variant_id: it.variant_id,
        quantity: it.quantity
      }));
      const { error: iErr } = await supabase.from('combo_items').insert(comboItems);
      if (iErr) throw iErr;
    }

    return NextResponse.json({ success: true, combo: newCombo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { id, combo, items } = body;
    const supabase = await createAuthClient();

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    // Update combo info
    const { error: cErr } = await supabase.from('combos').update(combo).eq('id', id);
    if (cErr) throw cErr;

    // Update items: DELETE + INSERT
    await supabase.from('combo_items').delete().eq('combo_id', id);
    
    if (items && items.length > 0) {
      const comboItems = items.map((it: any) => ({
        combo_id: id,
        product_id: it.product_id,
        variant_id: it.variant_id,
        quantity: it.quantity
      }));
      const { error: iErr } = await supabase.from('combo_items').insert(comboItems);
      if (iErr) throw iErr;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const supabase = await createAuthClient();
    
    // Əvvəlcə asılı olan item-ləri silirik
    await supabase.from('combo_items').delete().eq('combo_id', id);
    
    const { error } = await supabase.from('combos').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
