import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

/**
 * GET /api/owner/dashboard
 *
 * 2026-09-26 (Task 53 P1-3): owner mobile dashboard aggregation.
 * Single read-only endpoint that feeds /owner (Toast-Now style phone view):
 *   sales today          → sales {revenue, orders, avg_ticket, items_sold}
 *   hourly bars 10..23   → hourly [{hour, revenue, orders}]
 *   "Now" card           → now {open_tables, kds_active, delivery_in_progress,
 *                               takeaway_waiting}
 *   top 5 dishes         → top_dishes [{name, qty, revenue}]
 *   alerts               → alerts {low_stock[], overdue_kds[], order_delay_minutes}
 *   last 10 orders       → last_orders []
 *
 * NO migration, NO new tables: computed from existing data —
 *   orders (status/created_at/order_type/order_source/kitchen_status/
 *   delivery_status/total_amount), order_items, inventory_status VIEW
 *   (the same source /api/inventory + /admin/stock use), settings
 *   (order_delay_minutes) and table_floors (status='occupied').
 *
 * Auth: same session guard as every other /api route (validateAuth → saito_token
 * cookie + sessions table). Service-role REST fetch, same helper shape as
 * /api/stats + /api/dashboard.
 */

export const dynamic = 'force-dynamic';

// Terminal order states — must never count as "active" (mirrors
// /admin/delivery ORDER_DEAD + /api/stats paid-only revenue rule).
const DEAD_ORDER_STATUSES = ['cancelled', 'closed', 'refunded', 'partially_refunded', 'voided'];
// Kitchen-side active ticket states (orders.kitchen_status — see src/lib/posStatus.ts).
const KDS_ACTIVE_STATUSES = ['pending', 'cooking', 'preparing'];
// Courier-side in-progress states (delivery_status machine).
const DELIVERY_IN_PROGRESS_STATUSES = ['picked_up', 'in_transit'];
const DEFAULT_DELAY_MINUTES = 15;
const CHART_FIRST_HOUR = 10;
const CHART_LAST_HOUR = 23;

function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function isDead(status: unknown): boolean {
  return DEAD_ORDER_STATUSES.includes(String(status || ''));
}

function isDeliveryFamily(o: any): boolean {
  return o?.order_source === 'delivery' || o?.order_type === 'delivery';
}

function isTakeawayFamily(o: any): boolean {
  return o?.order_source === 'takeaway' || o?.order_type === 'takeaway';
}

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!baseUrl) {
      return NextResponse.json({ error: 'Supabase URL missing' }, { status: 500 });
    }

    const H = svcHeaders();
    const opts: RequestInit = { headers: H, cache: 'no-store' };

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const startIso = todayStart.toISOString();
    const endIso = now.toISOString();

    const ORDER_COLS =
      'id,order_number,table_number,order_type,order_source,status,kitchen_status,delivery_status,total_amount,created_at';

    const [ordersRes, itemsRes, stockRes, settingsRes, tablesRes] = await Promise.all([
      // All of today's orders (every state) — sales, "now", last-10 and the
      // overdue-KDS computation all derive from this single read.
      fetch(
        `${baseUrl}/rest/v1/orders?select=${ORDER_COLS}&created_at=gte.${startIso}&created_at=lte.${endIso}&order=created_at.desc`,
        opts,
      ),
      // Today's PAID order items — top dishes + items sold (same query shape as /api/stats).
      fetch(
        `${baseUrl}/rest/v1/order_items?select=order_id,product_id,product_name,quantity,total_price,order:orders!inner(status,created_at)&order.status=eq.paid&order.created_at=gte.${startIso}&order.created_at=lte.${endIso}`,
        opts,
      ),
      // Low stock — the same inventory_status VIEW the /admin/stock page uses
      // (/api/inventory): non-normal status == current_stock <= critical_limit.
      fetch(
        `${baseUrl}/rest/v1/inventory_status?select=id,name,unit,current_stock,critical_limit,status&status=neq.normal&order=current_stock.asc&limit=20`,
        opts,
      ),
      fetch(`${baseUrl}/rest/v1/settings?select=restaurant_name,order_delay_minutes&limit=1`, opts),
      fetch(`${baseUrl}/rest/v1/table_floors?select=id,status&status=eq.occupied`, opts),
    ]);

    const orders: any[] = asArray(await ordersRes.json().catch(() => []));
    const items: any[] = asArray(await itemsRes.json().catch(() => []));
    const lowStockRows: any[] = asArray(await stockRes.json().catch(() => []));
    const settingsRows: any[] = asArray(await settingsRes.json().catch(() => []));
    const occupiedTables: any[] = asArray(await tablesRes.json().catch(() => []));

    const settingsRow = settingsRows[0] || {};
    const delayMinutes =
      Number(settingsRow.order_delay_minutes) >= 1
        ? Number(settingsRow.order_delay_minutes)
        : DEFAULT_DELAY_MINUTES;

    /* ── 1. Today sales (paid orders only — canonical revenue rule) ───────── */
    const paidOrders = orders.filter((o) => o.status === 'paid');
    const revenue = paidOrders.reduce((s, o) => s + num(o.total_amount), 0);
    const paidCount = paidOrders.length;
    const itemsSold = items.reduce((s, i) => s + Math.max(0, num(i.quantity)), 0);

    const sales = {
      revenue,
      orders: paidCount,
      avg_ticket: paidCount > 0 ? revenue / paidCount : 0,
      items_sold: itemsSold,
    };

    /* ── 2. Hourly bars (10:00 → 23:00) ──────────────────────────────────── */
    const hourly: { hour: number; revenue: number; orders: number }[] = [];
    for (let h = CHART_FIRST_HOUR; h <= CHART_LAST_HOUR; h += 1) {
      hourly.push({ hour: h, revenue: 0, orders: 0 });
    }
    const hourIndex = new Map(hourly.map((b, i) => [b.hour, i]));
    paidOrders.forEach((o) => {
      const i = hourIndex.get(new Date(o.created_at).getHours());
      if (i === undefined) return;
      hourly[i].revenue += num(o.total_amount);
      hourly[i].orders += 1;
    });
    const maxHourRevenue = hourly.reduce((m, b) => Math.max(m, b.revenue), 0);

    /* ── 3. "Now" snapshot ───────────────────────────────────────────────── */
    const openOrders = orders.filter((o) => !isDead(o.status));

    const kdsTickets = openOrders.filter((o) => {
      const k = o.kitchen_status || 'pending';
      return KDS_ACTIVE_STATUSES.includes(k);
    });

    // Overdue: kitchen ticket still pending/preparing past the configured
    // order_delay_minutes (same threshold the KDS uses via /api/settings/order).
    const overdueKds = kdsTickets
      .map((o) => {
        const ms = Date.now() - new Date(o.created_at).getTime();
        const minutes = Math.max(0, Math.floor(ms / 60000));
        return { order: o, minutes };
      })
      .filter(({ minutes }) => minutes >= delayMinutes)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10)
      .map(({ order, minutes }) => ({
        id: order.id,
        order_number: order.order_number ?? null,
        table_number: order.table_number ?? null,
        order_type: order.order_type || order.order_source || null,
        kitchen_status: order.kitchen_status || 'pending',
        created_at: order.created_at,
        minutes,
      }));

    const deliveryInProgress = openOrders.filter(
      (o) => isDeliveryFamily(o) && DELIVERY_IN_PROGRESS_STATUSES.includes(String(o.delivery_status || '')),
    ).length;

    const takeawayWaiting = openOrders.filter(
      (o) =>
        isTakeawayFamily(o)
        && o.status !== 'served'
        && String(o.kitchen_status || '') === 'ready',
    ).length;

    // Open tables: canonical floor state, with a dine-in fallback when
    // table_floors is empty (fresh install / RLS-restricted read).
    const openTablesFallback = new Set(
      openOrders
        .filter((o) => !isDeliveryFamily(o) && !isTakeawayFamily(o) && o.table_number != null && o.status !== 'paid')
        .map((o) => String(o.table_number)),
    ).size;
    const openTables = occupiedTables.length > 0 ? occupiedTables.length : openTablesFallback;

    const current = {
      open_tables: openTables,
      kds_active: kdsTickets.length,
      delivery_in_progress: deliveryInProgress,
      takeaway_waiting: takeawayWaiting,
    };

    /* ── 4. Top 5 dishes today (by quantity) ─────────────────────────────── */
    const dishMap = new Map<string, { name: string; qty: number; revenue: number }>();
    items.forEach((i) => {
      const key = String(i.product_id || i.product_name || 'unknown');
      const entry = dishMap.get(key) || {
        name: String(i.product_name || 'Məhsul'),
        qty: 0,
        revenue: 0,
      };
      entry.qty += Math.max(0, num(i.quantity));
      entry.revenue += Math.max(0, num(i.total_price));
      dishMap.set(key, entry);
    });
    const topDishes = Array.from(dishMap.values())
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 5)
      .map((d) => ({ name: d.name, qty: d.qty, revenue: d.revenue }));

    /* ── 5. Alerts ───────────────────────────────────────────────────────── */
    const lowStock = lowStockRows.map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      current_stock: num(r.current_stock),
      critical_limit: num(r.critical_limit),
      status: r.status,
    }));

    /* ── 6. Last 10 orders ───────────────────────────────────────────────── */
    const lastOrders = orders
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map((o) => ({
        id: o.id,
        order_number: o.order_number ?? null,
        table_number: o.table_number ?? null,
        order_type: o.order_type || o.order_source || 'dine_in',
        total_amount: num(o.total_amount),
        status: o.status,
        kitchen_status: o.kitchen_status ?? null,
        delivery_status: o.delivery_status ?? null,
        created_at: o.created_at,
      }));

    return NextResponse.json({
      generated_at: endIso,
      day_start: startIso,
      venue_name: settingsRow.restaurant_name || 'Saito',
      sales,
      hourly,
      max_hour_revenue: maxHourRevenue,
      now: current,
      top_dishes: topDishes,
      alerts: {
        low_stock: lowStock,
        overdue_kds: overdueKds,
        order_delay_minutes: delayMinutes,
      },
      last_orders: lastOrders,
    });
  } catch (error: any) {
    console.error('[Owner Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'API xətası: ' + (error?.message || 'Unknown error') },
      { status: 500 },
    );
  }
}
