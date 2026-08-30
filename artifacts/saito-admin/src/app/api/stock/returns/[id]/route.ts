import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();

    const { data, error } = await supabase
      .from('supplier_returns')
      .select('*, supplier:suppliers(*), items:supplier_return_items(*, ingredient:ingredients(name,unit))')
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
      .from('supplier_returns')
      .update(body)
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

    const { data, error } = await supabase
      .from('supplier_returns')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('status', 'draft')
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Cannot cancel — already processed' }, { status: 409 });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
