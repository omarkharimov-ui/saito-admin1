import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13a: RecipeConstructorModal save — ATOMIC replace of the product's MANUAL
// recipe rows (the old client flow did select→delete→insert in three
// separate RLS-blocked calls with a manual rollback). Server-side it is
// one service-role transaction-ish sequence with a real error path.
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface SaveRow {
  ingredient_id: string;
  quantity_required: number;
  quantity_brutto?: number | null;
  hot_waste_percentage?: number | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const body = await request.json();
    const { menu_item_id, rows } = body as { menu_item_id: string; rows: SaveRow[] };
    if (!menu_item_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'menu_item_id + rows tələb olunur' }, { status: 400 });
    }

    const supabase = svc();
    const { error: delErr } = await supabase
      .from('recipes')
      .delete()
      .eq('menu_item_id', menu_item_id)
      .eq('is_ai_suggested', false);
    if (delErr) throw delErr;

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('recipes').insert(rows.map(r => ({
        menu_item_id,
        ingredient_id: r.ingredient_id,
        quantity_required: r.quantity_required,
        quantity_brutto: r.quantity_brutto ?? r.quantity_required,
        hot_waste_percentage: r.hot_waste_percentage ?? 0,
        is_ai_suggested: false,
      })));
      if (insErr) throw insErr;

      const { error: flagErr } = await supabase
        .from('products')
        .update({ has_active_recipe: true })
        .eq('id', menu_item_id);
      if (flagErr) throw flagErr;
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
