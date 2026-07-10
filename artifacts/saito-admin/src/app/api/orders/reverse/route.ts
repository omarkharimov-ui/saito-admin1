import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { order_id } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const s = svc();
    const rpcRes = await fetch(
      `${s.url}/rest/v1/rpc/saito_reverse_payment`,
      {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({ p_order_id: order_id }),
      }
    );

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.error || errText;
      } catch {}
      if (errMsg.includes('ORDER_NOT_PAID')) {
        return NextResponse.json({ error: 'Order is not paid' }, { status: 400 });
      }
      return NextResponse.json({ error: `Reversal failed: ${errMsg}` }, { status: 500 });
    }

    const result = await rpcRes.json();
    return NextResponse.json({
      success: true,
      reversed_amount: result.reversed_amount,
      reversed_inventory: result.reversed_inventory,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
