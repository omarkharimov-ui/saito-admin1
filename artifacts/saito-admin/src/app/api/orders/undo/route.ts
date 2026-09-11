import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// /api/orders/undo — F-10 (frozen): EVERY undo action maps onto the EXISTING
// atomic inverse RPC. NO raw client PATCH / table_state snapshot / manual
// total recomputation (all of which bypassed the state machine, FOR UPDATE
// locks, audit and outbox). Each RPC enforces: floor.manage (F-01),
// session-location scope (F-02/F-03), FOR UPDATE concurrency, audit + outbox.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('floor.manage');
    if (!auth.authenticated) return auth;

    const { action, data } = await request.json();
    if (!action || !data) {
      return NextResponse.json({ error: 'action and data required' }, { status: 400 });
    }

    const s = svc();
    // dispatch one inverse atomic RPC; surface DB-level errors with proper status
    const callRpc = async (fn: string, args: Record<string, unknown>): Promise<NextResponse> => {
      const rpcRes = await fetch(`${s.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_token: auth.token, p_performed_by: auth.user?.id || null, p_performed_by_terminal_id: null, ...args }),
      });
      const rpcData = await rpcRes.json().catch(() => ({}));
      if (!rpcRes.ok || rpcData?.success === false) {
        const msg = rpcData?.error || 'Undo failed';
        const status = msg === 'PERMISSION_DENIED' || msg === 'FORBIDDEN_LOCATION' ? 403
          : msg === 'FORBIDDEN' ? 401 : rpcRes.ok ? 400 : rpcRes.status;
        return NextResponse.json({ error: msg }, { status });
      }
      return NextResponse.json({ action, success: true, result: rpcData });
    };

    switch (action) {
      case 'merge': {
        // inverse of merge_tables_atomic = unmerge_tables_atomic
        const { targetTable, sourceTableNumbers } = data;
        if (!targetTable || !sourceTableNumbers?.length) return NextResponse.json({ error: 'targetTable + sourceTableNumbers required' }, { status: 400 });
        return callRpc('unmerge_tables_atomic', {
          p_parent_table_number: Number(targetTable),
          p_child_table_numbers: sourceTableNumbers.map(Number),
        });
      }
      case 'unmerge': {
        // inverse of unmerge_tables_atomic = merge_tables_atomic
        const { primaryTable, childTables } = data;
        if (!primaryTable || !childTables?.length) return NextResponse.json({ error: 'primaryTable + childTables required' }, { status: 400 });
        return callRpc('merge_tables_atomic', {
          p_parent_table_number: Number(primaryTable),
          p_child_table_numbers: childTables.map(Number),
        });
      }
      case 'transfer': {
        // inverse of A→B transfer = atomic B→A transfer (no manual order/
        // table PATCH rewrite — the RPC moves the order + sets both tables)
        const { from_table, to_table } = data;
        if (!from_table || !to_table) return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
        return callRpc('transfer_table_atomic', { p_from_table: Number(to_table), p_to_table: Number(from_table) });
      }
      case 'dismiss_undo': {
        const { table_number, child_tables } = data;
        const r1 = await callRpc('dismiss_undo_atomic', { p_table_number: Number(table_number) });
        if (r1.status !== 200) return r1;
        for (const child of child_tables || []) {
          await callRpc('dismiss_undo_atomic', { p_table_number: Number(child) }).catch(() => {});
        }
        return r1;
      }
      case 'seat': {
        // inverse of seat = clear the (occupied) table via the atomic clear
        const { table_number } = data;
        if (!table_number) return NextResponse.json({ error: 'table_number required' }, { status: 400 });
        return callRpc('clear_table_atomic', { p_table_number: Number(table_number) });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[API /orders/undo] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
