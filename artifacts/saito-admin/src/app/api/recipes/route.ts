import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13a (E2E r26 S10c): the recipes page read `recipes` from the BROWSER
// client → 200 + [] (the browser REST session is unauthenticated/anon for
// user JWTs; the RLS select policy only covers `authenticated`), so every
// product showed "0 resept" even though 12 products have recipes. The
// recipes table has NO authenticated INSERT/DELETE policies either, so
// every client-side write in the module was dead too. This route family
// serves the module via the service role (the app-wide pattern).
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const manual = searchParams.get('manual'); // '1' → only non-AI rows

    const supabase = svc();
    let q = supabase
      .from('recipes')
      .select('id, menu_item_id, ingredient_id, quantity_required, quantity_brutto, hot_waste_percentage, is_ai_suggested')
      .order('id');
    if (productId) q = q.eq('menu_item_id', productId);
    if (manual === '1') q = q.eq('is_ai_suggested', false);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — add ONE manual recipe row (the page's "əlavə et" action).
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { menu_item_id, ingredient_id, quantity_required, quantity_brutto, hot_waste_percentage } = await request.json();
    if (!menu_item_id || !ingredient_id || !(quantity_required > 0)) {
      return NextResponse.json({ error: 'menu_item_id + ingredient_id + quantity_required tələb olunur' }, { status: 400 });
    }
    const supabase = svc();
    const { data, error } = await supabase
      .from('recipes')
      .insert({
        menu_item_id, ingredient_id, quantity_required,
        quantity_brutto: quantity_brutto ?? quantity_required,
        hot_waste_percentage: hot_waste_percentage ?? 0,
        is_ai_suggested: false,
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from('products').update({ has_active_recipe: true }).eq('id', menu_item_id);
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — remove ONE recipe row by ?id= (the page's per-row "sil" action).
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id tələb olunur' }, { status: 400 });
    const supabase = svc();
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
