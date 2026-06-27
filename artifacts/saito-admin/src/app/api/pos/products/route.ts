import { NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET() {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();

    const [productsRes, categoriesRes, ingredientsRes, recipesRes, variantsRes] = await Promise.all([
      supabase.from('products').select('*, category:category_id(name,name_az,name_en,name_ru)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('ingredients').select('id, name, current_stock, unit'),
      supabase.from('recipes').select('*'),
      supabase.from('product_variants').select('*'),
    ]);

    return NextResponse.json({
      products: productsRes.data || [],
      categories: categoriesRes.data || [],
      ingredients: ingredientsRes.data || [],
      recipes: recipesRes.data || [],
      variants: variantsRes.data || [],
    }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
