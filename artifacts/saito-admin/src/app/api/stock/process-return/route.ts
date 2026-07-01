import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { return_id } = await request.json();
    if (!return_id) {
      return NextResponse.json({ error: 'return_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('process_supplier_return', {
      p_return_id: return_id,
      p_performed_by: auth.user?.id || null,
    });

    if (error) {
      console.error('[stock/process-return] RPC failed:', error);
      if (error.message === 'RETURN_NOT_FOUND') {
        return NextResponse.json({ error: 'Return not found' }, { status: 404 });
      }
      if (error.message === 'RETURN_ALREADY_PROCESSED') {
        return NextResponse.json({ error: 'Return already processed' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
