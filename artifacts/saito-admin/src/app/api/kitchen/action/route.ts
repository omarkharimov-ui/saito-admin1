import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * G7 (K frozen contract): KDS order-level browser actions → guarded server route
 * → service-role RPC. The browser (anon-key supabase.rpc) is 42501 for all
 * these fns (G3: REVOKE anon+authenticated); this route is the only valid path.
 *
 * Actions:
 *   prepare  -> prepare_order_items(p_order_id)            [kitchen.manage]
 *   ready    -> mark_order_ready(p_order_id)               [kitchen.manage]  (consumes stock)
 *   complete -> mark_order_completed(p_order_id, performed_by) [kitchen.manage]
 *   assign   -> assign_order_staff(p_order_id, staff_id, performed_by) [kitchen.manage]
 *   undo     -> update_order_item_status(item_id, status, prepared_qty) [kitchen.manage]
 *
 * Auth: requireKdsAction(orderRef, 'kitchen.manage') — validates session,
 * permission, and location scope. Returns { order_id, location_id, performed_by }.
 * All calls go through service_role (session identity = performed_by).
 */
const ACTIONS = new Set(['prepare', 'ready', 'complete', 'assign', 'undo']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action: string = body.action;
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Build the orderRef for requireKdsAction
    const orderRef: any = {};
    if (body.order_id) orderRef.order_id = body.order_id;
    if (body.order_item_id) orderRef.order_item_id = body.order_item_id;
    if (!orderRef.order_id && !orderRef.order_item_id) {
      return NextResponse.json({ error: 'order_id or order_item_id required' }, { status: 400 });
    }

    // Auth + permission + location scope
    const guard = await requireKdsAction(orderRef, 'kitchen.manage');
    if (!guard.ok) return guard.res;
    const { order_id, location_id, performed_by } = guard;

    const svc = await createAuthClient();
    if (!svc) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    let rpcName: string;
    let params: any;

    switch (action) {
      case 'prepare':
        rpcName = 'prepare_order_items';
        params = { p_order_id: order_id };
        break;
      case 'ready':
        rpcName = 'mark_order_ready';
        params = { p_order_id: order_id };
        break;
      case 'complete':
        rpcName = 'mark_order_completed';
        params = { p_order_id: order_id, p_performed_by: performed_by };
        break;
      case 'assign':
        rpcName = 'assign_order_staff';
        params = { p_order_id: order_id, p_staff_id: performed_by, p_performed_by: performed_by };
        break;
      case 'undo':
        rpcName = 'update_order_item_status';
        params = {
          p_order_item_id: body.order_item_id,
          p_status: body.status,
          p_prepared_quantity: body.prepared_quantity ?? null,
        };
        break;
      default:
        return NextResponse.json({ error: 'Unreachable' }, { status: 500 });
    }

    const { data, error } = await svc.rpc(rpcName, params);
    if (error) {
      const status = /PERMISSION_DENIED|P0001/.test(error.message || '') ? 403
                   : /NOT_FOUND|not found|INVALID/i.test(error.message || '') ? 404
                   : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ success: true, action, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'KDS action failed' }, { status: 500 });
  }
}
