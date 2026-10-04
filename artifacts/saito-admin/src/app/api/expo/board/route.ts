import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13d: service-role feed for the EXPO live display.
// ROOT CAUSE (audit 13d-A): the expo page polled `orders` (kitchen ready,
// takeaway/delivery) and `table_floors` (fresh transitions) directly from the
// browser — both are RLS-gated by app.current_role (not set for user sessions)
// → the physical display always showed empty lists while the "CANLI" lamp was
// green (Promise.allSettled counts empty as fulfilled).
// Mirrors the client logic (90s flash window) server-side, service-role.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

    const since = new Date(Date.now() - 90_000).toISOString();
    const [readyRes, flashRes] = await Promise.all([
      fetch(
        `${url}/rest/v1/orders?select=id,order_number,order_source,status,kitchen_status,updated_at` +
        `&kitchen_status=eq.ready&order_source=in.(takeaway,delivery)` +
        `&status=not.in.(closed,cancelled,canceled,voided,void,paid,served,refunded,partially_refunded,completed)` +
        `&order=updated_at.desc&limit=8`,
        { headers }
      ),
      fetch(
        `${url}/rest/v1/table_floors?select=id,table_number,status,bill_requested,updated_at` +
        `&updated_at=gte.${encodeURIComponent(since)}&order=updated_at.desc&limit=40`,
        { headers }
      ),
    ]);

    if (!readyRes.ok || !flashRes.ok) {
      return NextResponse.json({ error: 'Expo board load failed' }, { status: 502 });
    }
    const ready: any[] = await readyRes.json();
    const flashRows: any[] = await flashRes.json();
    const flashes = flashRows
      .flatMap(t => {
        const at = new Date(t.updated_at).getTime();
        if (!Number.isFinite(at)) return [];
        const out: any[] = [];
        if (t.status === 'empty') out.push({ key: `table-${t.id}`, kind: 'table', text: `Masa ${t.table_number}`, sub: 'boşaldı', at });
        if (t.bill_requested) out.push({ key: `bill-${t.id}`, kind: 'bill', text: `Masa ${t.table_number}`, sub: 'hesab göndərildi', at });
        return out;
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, 10);

    return NextResponse.json({
      ready: ready.map(o => ({
        key: o.id,
        orderNo: (o.order_number || '').replace(/^(ORD-?|TL-?|TA-?)/i, ''),
        label: o.order_source === 'delivery' ? 'Çatdırılma' : 'Gel-Al',
        kind: o.order_source === 'delivery' ? 'delivery' : 'takeaway',
      })),
      flashes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
