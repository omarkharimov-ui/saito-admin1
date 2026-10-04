import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c (supplier catalog — Toast "centralized vendor product catalog" parity):
// the price list a supplier actually sells. The order guide pre-fills
// suggested line prices from here; the invoice matcher can use it as a
// ground-truth anchor.
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const supabase = svc();
    let q = supabase.from('supplier_items').select('*, supplier:suppliers(name)').order('name').limit(500);
    if (supplierId) q = q.eq('supplier_id', supplierId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const { supplier_id, name, unit, unit_price, sku, active } = await request.json();
    if (!supplier_id || !name) return NextResponse.json({ error: 'supplier_id + name tələb olunur' }, { status: 400 });
    const supabase = svc();
    const { data, error } = await supabase
      .from('supplier_items')
      .insert({ supplier_id, name: String(name).trim(), unit: unit || null, unit_price: unit_price ?? null, sku: sku || null, active: active ?? true })
      .select('*, supplier:suppliers(name)')
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
