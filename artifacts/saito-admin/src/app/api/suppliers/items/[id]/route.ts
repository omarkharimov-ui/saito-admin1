import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c: supplier item delete / deactivate (PATCH active=false keeps price
// history; DELETE for typos). Explicit affected check — 13a rule.
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const { id } = await params;
    const supabase = svc();
    const { data: existing, error: getErr } = await supabase.from('supplier_items').select('id').eq('id', id).single();
    if (getErr) throw getErr;
    if (!existing) return NextResponse.json({ error: 'Tapılmadı' }, { status: 404 });
    const { error } = await supabase.from('supplier_items').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const k of ['name', 'unit', 'unit_price', 'sku', 'active'] as const) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: ' yenilənəcək sahə yoxdur' }, { status: 400 });
    const supabase = svc();
    const { data, error } = await supabase.from('supplier_items').update(updates).eq('id', id).select().single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Tapılmadı' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
