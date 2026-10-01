// ============================================================================
// 2026-10-02 (12a): COURIER APP — MY ACTIVE ORDERS.
// Orders assigned to this courier (courier_id = me), still on the road:
// delivery_status in (ready, waiting_courier, picked_up, in_transit) and the
// order not cancelled/voided. Includes everything the courier's phone UI
// needs: address, customer, phone, items count, total, fee, km, customer
// point (for the "Navigasiya" Google Maps button).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getCookieCourier } from '../../lib/courier-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } };
}

export async function GET(req: NextRequest) {
  try {
    const me = await getCookieCourier(req);
    if (!me) return NextResponse.json({ error: 'Cəlb olunmayıb' }, { status: 401 });

    const s = svc();
    const res = await fetch(
      `${s.url}/rest/v1/orders` +
      `?courier_id=eq.${me.id}` +
      `&order=created_at.desc&limit=20` +
      `&select=id,order_number,created_at,delivery_status,delivered_at,customer_name,customer_phone,delivery_address,delivery_km,delivery_fee,total_amount,status,estimated_delivery_time`,
      { headers: s.headers },
    );
    if (!res.ok) return NextResponse.json({ error: 'Sifarişlər gətirilmir' }, { status: 500 });
    const rows: any[] = await res.json();

    // customer point for the active ones (nav button + map)
    const active = rows.filter((o) =>
      ['ready', 'waiting_courier', 'picked_up', 'in_transit'].includes(o.delivery_status) &&
      !['cancelled', 'voided', 'refunded'].includes(o.status));
    if (active.length) {
      const ids = active.map((o) => o.id).join(',');
      const ptRes = await fetch(`${s.url}/rest/v1/orders?id=in.(${ids})&select=id,customer_lat,customer_lng`, { headers: s.headers });
      if (ptRes.ok) {
        const pts: any[] = await ptRes.json();
        const map = new Map(pts.map((p) => [p.id, p]));
        for (const o of active) {
          const p = map.get(o.id);
          o.customer_lat = p?.customer_lat ?? null;
          o.customer_lng = p?.customer_lng ?? null;
        }
      }
    }
    // items count (one query) — order_items' column is `quantity` (PGRST204
    // on `qty` failed silently and every card showed "0 məhsul").
    if (rows.length) {
      const ids = rows.map((o) => o.id).join(',');
      const itRes = await fetch(
        `${s.url}/rest/v1/order_items?order_id=in.(${ids})&select=order_id,quantity`,
        { headers: s.headers },
      );
      if (itRes.ok) {
        const items: any[] = await itRes.json();
        const counts = new Map<string, number>();
        for (const it of items) counts.set(it.order_id, (counts.get(it.order_id) || 0) + (Number(it.quantity) || 0));
        for (const o of rows) o.items_count = counts.get(o.id) || 0;
      }
    }
    return NextResponse.json({ orders: rows, me: { name: me.name, phone: me.phone } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Xəta' }, { status: 500 });
  }
}
