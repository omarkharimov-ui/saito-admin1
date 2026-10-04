import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13a: cookbook / AI recipe apply (single or batch). The old client code did
// delete(AI rows) → N×insert → products.update per product with THREE
// separate RLS-blocked calls. Server-side, one service-role pass each.
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface AiItem {
  menu_item_id: string;
  rows: { ingredient_id: string; quantity_required: number }[];
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const body = await request.json();
    const items = (body.items as AiItem[]) || [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items boş ola bilməz' }, { status: 400 });
    }

    const supabase = svc();
    let applied = 0;
    for (const it of items) {
      if (!it.menu_item_id || !Array.isArray(it.rows) || it.rows.length === 0) continue;
      const { error: delErr } = await supabase
        .from('recipes').delete()
        .eq('menu_item_id', it.menu_item_id).eq('is_ai_suggested', true);
      if (delErr) throw delErr;

      const { error: insErr } = await supabase.from('recipes').insert(it.rows.map(r => ({
        menu_item_id: it.menu_item_id,
        ingredient_id: r.ingredient_id,
        quantity_required: r.quantity_required,
        is_ai_suggested: true,
      })));
      if (insErr) throw insErr;

      const { error: flagErr } = await supabase
        .from('products').update({ has_active_recipe: true }).eq('id', it.menu_item_id);
      if (flagErr) throw flagErr;
      applied += 1;
    }
    return NextResponse.json({ success: true, applied });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
