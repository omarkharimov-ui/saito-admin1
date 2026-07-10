import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET() {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();

    const { data, error } = await supabase
      .from('stock_counts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();

    const { count_number, notes, counted_by } = await request.json();
    if (!count_number) {
      return NextResponse.json({ error: 'count_number is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('stock_counts')
      .insert({
        count_number,
        notes,
        counted_by: counted_by || auth.user?.id,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
