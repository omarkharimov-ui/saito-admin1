import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('id, is_ready_product, has_active_recipe, direct_ingredient_id');

    if (error) throw error;

    const outOfStock = new Set<string>();

    for (const product of products || []) {
      if (product.is_ready_product && product.direct_ingredient_id) {
        const { data: ing } = await supabase
          .from('ingredients')
          .select('current_stock')
          .eq('id', product.direct_ingredient_id)
          .single();
        if (!ing || Number(ing.current_stock) <= 0) {
          outOfStock.add(product.id);
        }
      } else if (product.has_active_recipe) {
        const { data: rows } = await supabase
          .from('recipes')
          .select('ingredient_id')
          .eq('menu_item_id', product.id);
        if (rows && rows.length > 0) {
          const ingIds = rows.map(r => r.ingredient_id);
          const { data: ings } = await supabase
            .from('ingredients')
            .select('current_stock')
            .in('id', ingIds);
          const hasStock = (ings || []).every(i => Number(i.current_stock) > 0);
          if (!hasStock) {
            outOfStock.add(product.id);
          }
        }
      }
    }

    return NextResponse.json({ outOfStock: Array.from(outOfStock) });
  } catch (e) {
    console.error('[stock-check]', e);
    return NextResponse.json({ outOfStock: [] });
  }
}
