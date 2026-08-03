import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const headerId = searchParams.get('recipe_header_id');

    const s = svc();
    let query = `${s.url}/rest/v1/recipe_versions?select=*,recipe_headers(*),products(name_az,name_en,name_ru)&order=version.desc`;
    if (headerId) query += `&recipe_header_id=eq.${headerId}`;
    if (productId) query += `&recipe_headers.product_id=eq.${productId}`;

    const res = await fetch(query, { headers: s.headers });
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { recipe_header_id, ingredients_json, created_by, is_active } = await request.json();
    if (!recipe_header_id || !ingredients_json) {
      return NextResponse.json({ error: 'recipe_header_id and ingredients_json are required' }, { status: 400 });
    }

    const s = svc();

    const headerRes = await fetch(`${s.url}/rest/v1/recipe_headers?id=eq.${recipe_header_id}&select=current_version`, { headers: s.headers });
    const headerData = await headerRes.json();
    const header = Array.isArray(headerData) ? headerData[0] : null;

    if (!header) {
      return NextResponse.json({ error: 'Recipe header not found' }, { status: 404 });
    }

    const newVersion = (header.current_version || 0) + 1;

    if (is_active) {
      await fetch(`${s.url}/rest/v1/recipe_versions?recipe_header_id=eq.${recipe_header_id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ is_active: false }),
      });
    }

    const res = await fetch(`${s.url}/rest/v1/recipe_versions`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        recipe_header_id,
        version: newVersion,
        ingredients_json,
        created_by: created_by || null,
        is_active: is_active ?? true,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to create recipe version' }, { status: 400 });
    }

    await fetch(`${s.url}/rest/v1/recipe_headers?id=eq.${recipe_header_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ current_version: newVersion }),
    });

    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] : data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
