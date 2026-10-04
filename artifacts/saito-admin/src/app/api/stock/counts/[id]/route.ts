import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();
    const { id } = await params; // Next 15+: params is async

    const { data, error } = await supabase
      .from('stock_counts')
      .select('*, items:stock_count_items(*, ingredient:ingredients(name,unit,current_stock,theoretical_stock))')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();
    const { id } = await params; // Next 15+: params is async

    const body = await request.json();
    const { data, error } = await supabase
      .from('stock_counts')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();
    const { id } = await params; // Next 15+: params is async

    // 13a (E2E r26 S13): the old delete silently returned success:true when
    // 0 rows matched (a completed count is NOT deletable by design, but the
    // caller had no way to know). Now the status is checked explicitly.
    const { data: existing, error: getErr } = await supabase
      .from('stock_counts')
      .select('id, status')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;
    if (!existing) return NextResponse.json({ error: 'Sayım tapılmadı' }, { status: 404 });
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Yalnız draft/cancelled sayımlar silinə bilər (completed = audit record)' },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('stock_counts')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
