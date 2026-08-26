import { NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { item_id, is_hold } = body;
    if (!item_id) {
      return NextResponse.json({ error: 'item_id required' }, { status: 400 });
    }

    const supabase = await createAuthClient();
    const staffId = auth.authenticated?.id || null;

    const { data, error } = await supabase.rpc('toggle_item_hold', {
      p_item_id: item_id,
      p_is_hold: !!is_hold,
      p_performed_by: staffId,
    });

    if (error) {
      console.error('[API /orders/item-hold] toggle_item_hold failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[API /orders/item-hold] error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
