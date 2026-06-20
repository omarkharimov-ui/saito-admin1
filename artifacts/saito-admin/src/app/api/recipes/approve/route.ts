import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * AI resept təklifini təsdiqlə:
 * 1. recipes.is_ai_suggested = false (artıq rəsmi reseptdir)
 * 2. products.has_active_recipe = true
 */
export async function POST(request: Request) {
  try {
    const { productId, ingredientIds } = await request.json();
    if (!productId || !Array.isArray(ingredientIds) || ingredientIds.length === 0) {
      return NextResponse.json({ error: 'productId and ingredientIds required' }, { status: 400 });
    }

    // 1. Seçilmiş AI reseptləri rəsmiləşdir
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ is_ai_suggested: false })
      .eq('menu_item_id', productId)
      .in('ingredient_id', ingredientIds);

    if (updateError) throw updateError;

    // 2. Digər AI reseptləri (təsdiqlənməmiş) sil — köhnə təkliflər
    await supabase
      .from('recipes')
      .delete()
      .eq('menu_item_id', productId)
      .eq('is_ai_suggested', true);

    // 3. Product-u rəsmi reseptli et
    await supabase
      .from('products')
      .update({ has_active_recipe: true })
      .eq('id', productId);

    return NextResponse.json({ success: true, productId });
  } catch (error: any) {
    console.error('[recipes/approve] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * AI resept təklifini rədd et:
 * 1. recipes cədvəlindən is_ai_suggested = true olanları sil
 * 2. products.has_active_recipe = false
 */
export async function DELETE(request: Request) {
  try {
    const { productId } = await request.json();
    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    await supabase
      .from('recipes')
      .delete()
      .eq('menu_item_id', productId)
      .eq('is_ai_suggested', true);

    await supabase
      .from('products')
      .update({ has_active_recipe: false })
      .eq('id', productId);

    return NextResponse.json({ success: true, productId });
  } catch (error: any) {
    console.error('[recipes/reject] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
