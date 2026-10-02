import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveReadLocationScope } from '@/lib/location-context';

// GET /api/kitchen/daily — 12j (owner, from the Toast comparison): the KDS
// "GÜN" (All Day) view — All Day View + production counts + kitchen
// productivity in ONE location-scoped read:
//   metrics    — today's tickets, items, produced items, avg accept (min),
//                avg prepare-to-ready (min)
//   production — per-product produced qty (served/completed items, top 30)
//   tickets    — every kitchen ticket of today (incl. served/closed)
// "Today" = the SERVER's local day (venue time), not UTC.
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const lctx = auth.user?.id ? await resolveReadLocationScope(auth.user.id) : null;
    const sessLoc = lctx?.locationId || null;
    if (!sessLoc) return NextResponse.json({ error: 'No active location' }, { status: 409 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const q = [
      'select=id,order_number,table_number,order_source,kitchen_status,created_at,kitchen_accepted_at,kitchen_ready_at,is_rush',
      ',order_items(id,product_name,quantity,kitchen_status)',
      `&location_id=eq.${encodeURIComponent(sessLoc)}`,
       // PostgREST: the range op comes AFTER the column (created_at=gte.…);
       // "gte.created_at" is a 400 (verified with the live service-role key).
       `&created_at=gte.${encodeURIComponent(start.toISOString())}`,
      '&kitchen_status=not.is.null',
      '&order=created_at.desc&limit=500',
    ].join('');
    const res = await fetch(`${url}/rest/v1/orders?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return NextResponse.json({ error: 'Failed to load daily kitchen data' }, { status: 502 });
    const orders: any[] = await res.json();

    let itemsTotal = 0, itemsProduced = 0, sumAccept = 0, nAccept = 0, sumReady = 0, nReady = 0;
    const prod = new Map<string, number>();
    const num = (o: any) => String(o.order_number || '').replace(/[^0-9]/g, '') || String(o.id).slice(-4).toUpperCase();
    const tickets = orders.map((o) => {
      const its: any[] = (o.order_items || []).filter((i: any) => (i.quantity ?? 0) > 0 && i.kitchen_status !== 'cancelled' && i.kitchen_status !== 'voided');
      const qty = its.reduce((s, i) => s + (i.quantity || 0), 0);
      itemsTotal += qty;
      for (const i of its) {
        if (['served', 'completed'].includes(i.kitchen_status)) {
          itemsProduced += i.quantity || 0;
          const name = i.product_name || '—';
          prod.set(name, (prod.get(name) || 0) + (i.quantity || 0));
        }
      }
      const created = new Date(o.created_at).getTime();
      if (o.kitchen_accepted_at) { sumAccept += new Date(o.kitchen_accepted_at).getTime() - created; nAccept += 1; }
      if (o.kitchen_ready_at) { sumReady += new Date(o.kitchen_ready_at).getTime() - created; nReady += 1; }
      const ks = String(o.kitchen_status || '');
      const status = ['served', 'completed'].includes(ks) ? 'served'
        : ks === 'ready' ? 'ready'
        : ks === 'partially_ready' ? 'partially'
        : ['accepted', 'sent', 'preparing', 'cooking'].includes(ks) ? 'preparing'
        : 'waiting';
      const endAt = o.kitchen_ready_at ? new Date(o.kitchen_ready_at).getTime() : Date.now();
      const d = new Date(o.created_at);
      return {
        id: o.id,
        title: o.order_source === 'dine_in' ? `Masa ${o.table_number ?? '?'}`
          : o.order_source === 'takeaway' ? `Gel-Al ${num(o)}` : `Çatdırılma ${num(o)}`,
        time: d.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
        status,
        minutes: Math.max(0, Math.round((endAt - created) / 60000)),
        qty,
        // 12q: rush tickets are marked in the day view (red indicator only —
        // the GÜN row is a summary, not a live ticket).
        is_rush: Boolean(o.is_rush),
      };
    });

    return NextResponse.json({
      metrics: {
        tickets: orders.length,
        items: itemsTotal,
        produced: itemsProduced,
        avgAcceptMin: nAccept ? Math.max(1, Math.round(sumAccept / nAccept / 60000)) : null,
        avgReadyMin: nReady ? Math.max(1, Math.round(sumReady / nReady / 60000)) : null,
      },
      production: [...prod.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, qty]) => ({ name, qty })),
      tickets,
    });
  } catch (e: any) {
    console.error('[kitchen/daily] Fatal:', e);
    return NextResponse.json({ error: e?.message || 'Failed to load daily kitchen data' }, { status: 500 });
  }
}
