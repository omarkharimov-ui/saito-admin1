import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;

  try {
    const { productId, ingredientIds } = await request.json();
    if (!productId || !Array.isArray(ingredientIds) || ingredientIds.length === 0) {
      return NextResponse.json({ error: 'productId and ingredientIds required' }, { status: 400 });
    }

    const supabase = svc();
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ is_ai_suggested: false })
      .eq('menu_item_id', productId)
      .in('ingredient_id', ingredientIds);

    if (updateError) throw updateError;

    await supabase
      .from('recipes')
      .delete()
      .eq('menu_item_id', productId)
      .eq('is_ai_suggested', true);

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

export async function DELETE(request: Request) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;

  try {
    const { productId } = await request.json();
    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    const supabase = svc();
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
