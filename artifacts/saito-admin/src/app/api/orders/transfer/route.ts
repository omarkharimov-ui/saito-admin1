import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { from_table, to_table } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    // Call atomic v3 RPC
    const { data, error } = await supabase.rpc('transfer_tables_v3', {
      p_from_table: from_table,
      p_to_table: to_table,
      p_performed_by: auth.user?.id || null,
    });

    if (error) {
      console.error('[Transfer Fatal]', error);
      const msg = error.message === 'TARGET_TABLE_NOT_EMPTY' ? 'Hədəf masa boş deyil' : error.message;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        undo: { fromTable: from_table, toTable: to_table }
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

