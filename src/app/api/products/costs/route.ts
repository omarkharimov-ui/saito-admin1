import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/products/costs — bütün məhsulların maya dəyəri məlumatı
export async function GET() {
  try {
    const supabase = svc();

    const { data, error } = await supabase
      .from('products')
      .select('id, name_az, price, cost_price, profit_margin');

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/products/costs — bütün məhsulların maya dəyərini manual yenilə
export async function POST() {
  try {
    const supabase = svc();

    // Hər məhsul üçün maya dəyərini hesabla
    const { data: products } = await supabase
      .from('products')
      .select('id, price');

    if (!products) return NextResponse.json({ updated: 0 });

    let updated = 0;
    for (const product of products) {
      const { data: recipeIngredients } = await supabase
        .from('recipes')
        .select('quantity_required, ingredient:ingredients(average_cost_per_unit)')
        .eq('menu_item_id', product.id)
        .eq('is_ai_suggested', false);

      const totalCost = (recipeIngredients || []).reduce((sum, r) => {
        const ing = Array.isArray(r.ingredient) ? r.ingredient[0] : r.ingredient;
        return sum + (r.quantity_required || 0) * (ing?.average_cost_per_unit || 0);
      }, 0);

      const margin = product.price > 0 ? ((product.price - totalCost) / product.price) * 100 : 0;

      await supabase
        .from('products')
        .update({
          cost_price: Math.round(totalCost * 100) / 100,
          profit_margin: Math.round(margin * 10) / 10,
        })
        .eq('id', product.id);

      updated++;
    }

    return NextResponse.json({ updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
