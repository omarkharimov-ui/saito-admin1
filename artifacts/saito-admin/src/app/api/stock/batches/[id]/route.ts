import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13c: batch delete — explicit affected check (no silent no-ops, 13a rule).
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
    const { data: existing, error: getErr } = await supabase.from('stock_batches').select('id').eq('id', id).single();
    if (getErr) throw getErr;
    if (!existing) return NextResponse.json({ error: 'Batch tapılmadı' }, { status: 404 });
    const { error } = await supabase.from('stock_batches').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
