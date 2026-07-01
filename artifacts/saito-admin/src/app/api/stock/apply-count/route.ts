import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { count_id } = await request.json();
    if (!count_id) {
      return NextResponse.json({ error: 'count_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('apply_stock_count', {
      p_count_id: count_id,
      p_performed_by: auth.user?.id || null,
    });

    if (error) {
      console.error('[stock/apply-count] RPC failed:', error);
      if (error.message === 'COUNT_NOT_FOUND') {
        return NextResponse.json({ error: 'Stock count not found' }, { status: 404 });
      }
      if (error.message === 'COUNT_NOT_COMPLETED') {
        return NextResponse.json({ error: 'Stock count must be completed before applying' }, { status: 409 });
      }
      if (error.message === 'COUNT_CANCELLED') {
        return NextResponse.json({ error: 'Stock count is cancelled' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
