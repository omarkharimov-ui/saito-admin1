import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_numbers } = await request.json();
    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'Ən azı 2 masa seçilməlidir' }, { status: 400 });
    }

    // Call atomic v3 RPC - SSOT for table grouping and order merging
    const { data, error } = await supabase.rpc('merge_tables_v3', {
      p_table_numbers: table_numbers,
      p_performed_by: auth.user?.id || null
    });

    if (error) {
      console.error('[Merge Fatal]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        ...data,
        undo: { 
          sourceTableNumbers: table_numbers.slice(1),
          targetTable: table_numbers[0]
        }
      } 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


