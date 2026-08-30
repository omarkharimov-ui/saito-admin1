import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const body = await request.json();
    const { order_id, status, courier_id, courier_name, tracking_number, terminal_id } = body;
    if (!order_id || !status) {
      return NextResponse.json({ error: 'order_id and status are required' }, { status: 400 });
    }

    const validStatuses = ['pending', 'preparing', 'ready', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'confirmed', 'paid'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const s = svc();

    // Use atomic DB RPC for status transitions — no fallback, RPC is the single entry point
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/transition_delivery_status`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_order_id: order_id,
        p_new_status: status,
        p_courier_id: courier_id || null,
        p_courier_name: courier_name || null,
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: terminal_id || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return NextResponse.json({ error: `Delivery status transition failed: ${errText}` }, { status: 400 });
    }

    const rpcResult = await rpcRes.json();

    return NextResponse.json({
      success: true,
      order: {
        id: order_id,
        delivery_status: status,
        courier_id: courier_id || null,
        courier_name: courier_name || null,
        tracking_number: tracking_number || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');
    const status = searchParams.get('status');

    const s = svc();
    let query = `${s.url}/rest/v1/orders?select=id,order_number,delivery_status,courier_id,courier_name,tracking_number,estimated_delivery_time,delivered_at,customer_name,customer_phone,delivery_address,status,table_number&order_source=eq.delivery`;

    if (orderId) {
      query += `&id=eq.${orderId}`;
    }
    if (status) {
      query += `&delivery_status=eq.${encodeURIComponent(status)}`;
    }

    const res = await fetch(query, { headers: s.headers });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch delivery orders' }, { status: 500 });
    }

    const orders = await res.json();
    return NextResponse.json({ orders: Array.isArray(orders) ? orders : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
