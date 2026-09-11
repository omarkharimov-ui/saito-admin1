import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/orders/item-hold
 * K-G3: canonical hold path. Session identity + location scope (requireKdsAction)
 * + DB-level kitchen.manage + location (item_set_hold). Client performed_by NOT accepted.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { item_id, is_hold } = body;
    if (!item_id) {
      return NextResponse.json({ error: 'item_id required' }, { status: 400 });
    }

    const g = await requireKdsAction({ order_item_id: item_id });
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data, error } = await supabase.rpc('item_set_hold', {
      p_token: g.token,
      p_item_id: item_id,
      p_is_hold: !!is_hold,
      p_reason: body.reason || 'item_hold',
      p_metadata: null,
      p_correlation_id: null,
    });

    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      if (m.includes('ORDER_FINALIZED')) return NextResponse.json({ success: false, error: 'ORDER_FINALIZED' }, { status: 409 });
      if (m.includes('ITEM_NOT_FOUND')) return NextResponse.json({ success: false, error: 'ITEM_NOT_FOUND' }, { status: 404 });
      console.error('[item-hold] item_set_hold failed:', m);
      return NextResponse.json({ error: m }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[API /orders/item-hold] error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
