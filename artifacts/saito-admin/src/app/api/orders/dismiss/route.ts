import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createAuthClient();
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('dismiss_table_session', {
      p_table_number: table_number,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, result: data });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
