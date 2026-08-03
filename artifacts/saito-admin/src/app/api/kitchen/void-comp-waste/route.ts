import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

async function callRpc(rpcName: string, params: Record<string, any>) {
  const s = svc();
  const res = await fetch(`${s.url}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: s.headers,
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const { action, order_item_id, reason, terminal_id } = await req.json();
    if (!action || !order_item_id) {
      return NextResponse.json({ error: 'action and order_item_id required' }, { status: 400 });
    }

    const performedBy = auth.user?.id || null;
    const terminalId = terminal_id || null;
    let result: any;

    switch (action) {
      case 'void':
        result = await callRpc('void_order_item_atomic', { p_order_item_id: order_item_id, p_reason: reason || 'void', p_performed_by: performedBy, p_performed_by_terminal_id: terminalId });
        break;
      case 'comp':
        result = await callRpc('comp_order_item_atomic', { p_order_item_id: order_item_id, p_reason: reason || 'comp', p_performed_by: performedBy, p_performed_by_terminal_id: terminalId });
        break;
      case 'waste':
        result = await callRpc('waste_order_item_atomic', { p_order_item_id: order_item_id, p_reason: reason || 'waste', p_performed_by: performedBy, p_performed_by_terminal_id: terminalId });
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[API /kitchen/void-comp-waste] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
