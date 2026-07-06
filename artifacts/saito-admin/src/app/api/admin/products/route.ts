import { NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET() {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'cashier']);
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();

    const { data: products, error } = await supabase
      .from('products')
      .select('*, category:categories(*), variants:product_variants(id,name,price,image_url,variant_type,parent_variant_id,is_in_stock,views_count,translations)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    return NextResponse.json({ products, categories });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
