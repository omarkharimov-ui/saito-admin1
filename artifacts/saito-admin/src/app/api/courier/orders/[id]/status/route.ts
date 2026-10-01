// ============================================================================
// 2026-10-02 (12a): COURIER APP — STATUS ACTIONS.
// POST {action: 'picked_up' | 'in_transit' | 'delivered'} → the atomic
// courier_transition() DB function: assignment-checked (only YOUR orders),
// validate_transition-enforced (no back-steps), delivered_at stamped by the
// DB, operation_logs row with performed_by = the courier.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getCookieCourier } from '../../../../lib/courier-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCookieCourier(req);
    if (!me) return NextResponse.json({ error: 'Cəlb olunmayıb' }, { status: 401 });

    const { id: orderId } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    if (!['picked_up', 'in_transit', 'delivered'].includes(action)) {
      return NextResponse.json({ error: 'Naməlum action' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/rpc/courier_transition`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({ p_courier_id: me.id, p_order_id: orderId, p_new_status: action }),
    });
    const out: any = await res.json().catch(() => null);
    if (!res.ok || !out || out.success === false) {
      return NextResponse.json({ error: (out && out.error) || 'Status dəyişmədi' }, { status: 400 });
    }
    // fresh GPS = the order's point while delivering (map freshness anchor)
    return NextResponse.json({ success: true, order: { id: orderId, delivery_status: out.new, old: out.old } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Xəta' }, { status: 500 });
  }
}
