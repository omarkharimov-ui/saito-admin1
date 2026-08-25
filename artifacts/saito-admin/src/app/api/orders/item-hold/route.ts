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
    const { error } = await supabase
      .from('order_items')
      .update({
        is_hold: !!is_hold,
        hold_until: is_hold ? new Date().toISOString() : null,
      })
      .eq('id', item_id);

    if (error) {
      console.error('[API /orders/item-hold] update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item_id, is_hold: !!is_hold });
  } catch (err: any) {
    console.error('[API /orders/item-hold] error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
