import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

export async function GET() {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const [productsRes, categoriesRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/products?select=*,category:category_id(name,name_az,name_en,name_ru)&order=created_at.desc`,
        { headers }
      ),
      fetch(`${SUPABASE_URL}/rest/v1/categories?select=*&order=name.asc`, { headers }),
    ]);

    if (!productsRes.ok || !categoriesRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    const products = await productsRes.json();
    const categories = await categoriesRes.json();

    return NextResponse.json({ products, categories }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
