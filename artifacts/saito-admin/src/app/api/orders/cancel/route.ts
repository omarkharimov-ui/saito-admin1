import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function DELETE(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const tableNumber = parseInt(searchParams.get('table_number') || '', 10);
    if (!tableNumber) {
      return NextResponse.json({ error: 'table_number required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('cancel_table_orders', {
      p_table_number: tableNumber,
      p_performed_by: auth.user?.id || null,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
