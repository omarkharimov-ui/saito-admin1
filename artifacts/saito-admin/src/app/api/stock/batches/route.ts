import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c (batch/expiry layer — Toast parity for sushi freshness): batches are a
// SUPPLEMENTARY tracking layer on top of the frozen aggregate consumption
// engine (consume_stock_for_item stays untouched). A batch records "we have
// N units of X until date Y"; FEFO = first-expiry-first-out ordering for the
// kitchen's attention. Batches do NOT gate sales — they alert.
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
    const ingredientId = searchParams.get('ingredient_id');
    const supabase = svc();
    let q = supabase.from('stock_batches').select('*, ingredient:ingredients(name, unit)').order('created_at', { ascending: false }).limit(200);
    if (ingredientId) q = q.eq('ingredient_id', ingredientId);
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
    const { ingredient_id, qty, expiry_date, source, note } = await request.json();
    if (!ingredient_id || !(Number(qty) > 0)) {
      return NextResponse.json({ error: 'ingredient_id + qty > 0 tələb olunur' }, { status: 400 });
    }
    const supabase = svc();
    const { data, error } = await supabase
      .from('stock_batches')
      .insert({
        ingredient_id,
        qty: Number(qty),
        expiry_date: expiry_date || null,
        source: source || null,
        note: note || null,
      })
      .select('*, ingredient:ingredients(name, unit)')
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
