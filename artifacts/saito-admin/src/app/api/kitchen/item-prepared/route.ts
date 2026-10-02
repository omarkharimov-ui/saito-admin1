import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/kitchen/item-prepared
 * 12o (owner): "tik oğlanda avtomatik hazırdır qəbul etməsin sistem" — the
 * per-item ✓ on the KDS board is PREPARATION PROGRESS, not a state-machine
 * transition. This route writes order_items.prepared_quantity ONLY:
 *   - kitchen_status is never SET → trg_item_state_machine_guard and
 *     trg_kds_ticket_emit (both UPDATE OF kitchen_status) stay silent;
 *   - the frozen rollup (trg_sync_order_kitchen_status, AFTER UPDATE) does
 *     recompute, but its CASE depends on kitchen_status alone → the order
 *     keeps its exact same kitchen_status (verified against the real DB fn);
 *   - mark_item_ready_atomic / kitchen_ready_at / SERVİSƏ derivation are
 *     untouched → a tick can no longer auto-accept (GÖZLƏYİR stays) or
 *     auto-ready the order. Declaring "Hazırdır" remains the CTA's job.
 * Session identity + location scope + kitchen.manage (same guard family as
 * item-recall).
 */
export async function POST(req: NextRequest) {
  try {
    const { order_item_id, prepared_quantity } = await req.json();
    if (!order_item_id) return NextResponse.json({ error: 'order_item_id is required' }, { status: 400 });

    const g = await requireKdsAction({ order_item_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const qty = Math.max(0, Math.min(999, Math.floor(Number(prepared_quantity) || 0)));

    const supabase = await createAuthClient(); // service role
    const { data, error } = await supabase
      .from('order_items')
      .update({ prepared_quantity: qty })
      .eq('id', order_item_id)
      .select('id, prepared_quantity, kitchen_status')
      .single();

    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      if (/NOT_FOUND|not found|P0002/i.test(m)) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
      return NextResponse.json({ error: m }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /kitchen/item-prepared] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
