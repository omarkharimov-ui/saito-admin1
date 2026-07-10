import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const { product_id, product_name } = await request.json();
    if (!product_id) {
      return NextResponse.json({ error: 'product_id required' }, { status: 400 });
    }

    const s = svc();

    // Get product info
    const productRes = await fetch(
      `${s.url}/rest/v1/products?id=eq.${product_id}&select=is_ready_product,direct_ingredient_id`,
      { headers: s.headers },
    );
    const product = (await productRes.json())?.[0];
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const ingredientIds: string[] = [];
    if (product.is_ready_product && product.direct_ingredient_id) {
      ingredientIds.push(product.direct_ingredient_id);
    } else {
      const recipesRes = await fetch(
        `${s.url}/rest/v1/recipes?menu_item_id=eq.${product_id}&select=ingredient_id`,
        { headers: s.headers },
      );
      const recipes = await recipesRes.json();
      if (recipes?.length > 0) {
        ingredientIds.push(...recipes.map((r: any) => r.ingredient_id));
      }
    }

    for (const iid of ingredientIds) {
      await fetch(`${s.url}/rest/v1/ingredients?id=eq.${iid}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          current_stock: 0,
          updated_at: new Date().toISOString(),
        }),
      });

      await fetch(`${s.url}/rest/v1/inventory_logs`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({
          ingredient_id: iid,
          type: 'adjustment',
          quantity: 0,
          reason: `Kitchen: ${product_name} sold out`,
          reference_type: 'sold_out',
          reference_id: product_id,
          created_at: new Date().toISOString(),
        }),
      });
    }

    await fetch(`${s.url}/rest/v1/products?id=eq.${product_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ is_available: false }),
    });

    return NextResponse.json({ success: true, ingredients_updated: ingredientIds.length });
  } catch (error: any) {
    console.error('[API /kitchen/sold-out] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
