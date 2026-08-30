import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();

    const { data, error } = await supabase
      .from('stock_counts')
      .select('*, items:stock_count_items(*, ingredient:ingredients(name,unit,current_stock,theoretical_stock))')
      .eq('id', params.id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();

    const body = await request.json();
    const { data, error } = await supabase
      .from('stock_counts')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();

    const { error } = await supabase
      .from('stock_counts')
      .delete()
      .eq('id', params.id)
      .in('status', ['draft', 'cancelled']);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
