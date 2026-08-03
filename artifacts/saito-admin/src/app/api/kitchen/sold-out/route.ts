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

    const { product_id, product_name, terminal_id } = await request.json();
    if (!product_id) {
      return NextResponse.json({ error: 'product_id required' }, { status: 400 });
    }

    const s = svc();
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/mark_sold_out_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_product_id: product_id,
        p_product_name: product_name || null,
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: terminal_id || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return NextResponse.json({ error: `Sold out failed: ${errText}` }, { status: 400 });
    }

    const data = await rpcRes.json();
    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, ingredients_updated: data?.ingredients_updated || 0 });
  } catch (error: any) {
    console.error('[API /kitchen/sold-out] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
