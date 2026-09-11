import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';
import {
  FINAL_ORDER_STATUSES,
  composeAggregates,
  composedKitchenStatus,
  isOpenOrder,
  openOrderSums,
} from '@/lib/pos-tables';

function getHeaders() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    SUPABASE_URL,
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  };
}

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { SUPABASE_URL, headers } = getHeaders();
  try {
    // F-03 (frozen): multi-location. This route fetches with the service role
    // (bypasses RLS), so it MUST scope to the caller's ACTIVE location —
    // otherwise every location's tables/orders/reservations would render.
    // Location = session.active_location_id (server-trusted, never client).
    const token: string = auth.token || '';
    let locFilter = '';
    if (token) {
      const sessRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions?select=active_location_id&token=eq.${encodeURIComponent(token)}&limit=1`, { headers });
      const sess = await sessRes.json().catch(() => []);
      const locId = Array.isArray(sess) ? sess[0]?.active_location_id : null;
      if (locId) locFilter = `&location_id=eq.${encodeURIComponent(locId)}`;
    }

    const [floorsRes, ordersRes, reservationsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc${locFilter}`, { headers }),
      // F-3: exclude ALL final states (same 6-state set the DB aggregate trigger
      // uses in sync_table_order_aggregates). Previously only 3 were excluded,
      // which would inflate the card for refunded/voided/partially_refunded orders.
      // F-03: also scope by the active location.
      fetch(
        `${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*)&status=not.in.(${FINAL_ORDER_STATUSES.join(',')})&order=created_at.desc${locFilter}`,
        { headers }
      ),
      // F-03: reservations scoped by location_id too (reservations carry it).
      fetch(`${SUPABASE_URL}/rest/v1/reservations?select=*&status=neq.cancelled&status=neq.no_show&status=neq.archived${locFilter}`, { headers }),
    ]);

    const rawFloors = await floorsRes.json();
    const rawOrders = await ordersRes.json();
    const rawReservations = await reservationsRes.json();

    // ─── SSOT: table_floors drives everything ───
    // reservation_id -> reservation metadata (name, phone, time, pre_order)
    // current_order_id -> current active order (items, totals, kitchen_status)
    // orders by table_number -> order history / fallback for data migration

    const floorByNumber = new Map<number, any>();
    const reservationIds = new Set<string>();
    const currentOrderIds = new Set<string>();

    (rawFloors || []).forEach((f: any) => {
      floorByNumber.set(f.table_number, f);
      if (f.reservation_id) reservationIds.add(f.reservation_id);
      if (f.current_order_id) currentOrderIds.add(f.current_order_id);
    });

    // Fetch only reservations linked from table_floors
    const resMap = new Map<string, any>();
    if (reservationIds.size > 0) {
      const resRes = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?select=*&id=in.(${Array.from(reservationIds).join(',')})`,
        { headers }
      );
      const resData = await resRes.json();
      (resData || []).forEach((r: any) => resMap.set(r.id, r));
    }

    // Pre-order flag from reservation
    const resPreOrder = new Map<string, boolean>();
    resMap.forEach((r: any, id: string) => {
      resPreOrder.set(id, !!r.pre_order);
    });

    // Fetch only current orders linked from table_floors
    const currentOrderMap = new Map<string, any>();
    if (currentOrderIds.size > 0) {
      const ordRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*)&id=in.(${Array.from(currentOrderIds).join(',')})`,
        { headers }
      );
      const ordData = await ordRes.json();
      (ordData || []).forEach((o: any) => currentOrderMap.set(o.id, o));
    }

    // All orders by table_number for history / fallback
    const ordersByTable: Record<number, any[]> = {};
    (rawOrders || []).forEach((o: any) => {
      if (!ordersByTable[o.table_number]) ordersByTable[o.table_number] = [];
      ordersByTable[o.table_number].push(o);
    });

    // Merged groups from table_floors
    const parentToChildren: Record<number, number[]> = {};
    (rawFloors || []).forEach((f: any) => {
      if (f.merged_into_table) {
        if (!parentToChildren[f.merged_into_table]) parentToChildren[f.merged_into_table] = [];
        parentToChildren[f.merged_into_table].push(f.table_number);
      }
    });

    const floorMap: Record<string, any> = {};

    (rawFloors || []).forEach((f: any) => {
      const fn = f.floor_name || 'Main';
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [], merged_groups: [] };

      const reservation = f.reservation_id ? resMap.get(f.reservation_id) : null;
      const currentOrder = f.current_order_id ? currentOrderMap.get(f.current_order_id) : null;
      const hasPreOrder = f.reservation_id ? (resPreOrder.get(f.reservation_id) || false) : false;

      // Status from table_floors is authoritative.
      // Only override if table has a linked order but floor shows empty/dirty
      // (data migration safety net).
      let status = f.status;
      if (currentOrder && ['empty', 'dirty'].includes(status)) {
        status = 'occupied';
      }

      const isParent = parentToChildren[f.table_number] !== undefined;
      const isChild = f.merged_into_table !== null;
      const parentTableNumber = isChild ? f.merged_into_table : f.table_number;
      const childrenNums = parentToChildren[parentTableNumber] || [];
      const allInGroup = [parentTableNumber, ...childrenNums];

      // F-1: one canonical aggregate source. Every member's OPEN orders are summed
      // exactly once (the same rows the DB aggregate trigger tracks). We do NOT add
      // floor.total_amount on top of the order sum — that was the double-count defect.
      const groupMembers = allInGroup.map((tNum: number) => ({
        floor: floorByNumber.get(tNum),
        orders: ordersByTable[tNum] || [],
      })).filter((m: { floor: any }) => m.floor);
      const agg = composeAggregates({ floor: f, groupMembers, currentOrder });

      const tableOrders = currentOrder ? [currentOrder] : (ordersByTable[f.table_number] || []);
      const groupOrderIds: string[] = [];
      for (const m of groupMembers) {
        if (m.floor.current_order_id) groupOrderIds.push(m.floor.current_order_id);
        for (const o of m.orders) groupOrderIds.push(o.id);
      }
      const singleOrderIds = f.current_order_id ? [f.current_order_id] : tableOrders.map((o: any) => o.id);

      const processedTable = {
        ...f,
        last_activity_at: agg.last_activity_at || f.last_activity_at,
        status: (isChild || isParent) ? (status === 'empty' || status === 'dirty' ? 'occupied' : status) : status,
        total_amount: agg.total_amount,
        guest_count: agg.guest_count,
        item_count: agg.item_count,
        order_count: agg.order_count,
        has_pending: agg.has_pending,
        oldest_pending_at: agg.oldest_pending_at,
        merged_with: isChild || isParent ? allInGroup : [],
        is_group: isChild || isParent,
        parent_table_number: parentTableNumber,
        order_ids: isChild || isParent ? groupOrderIds : singleOrderIds,
        kitchen_status: composedKitchenStatus(currentOrder, f.kitchen_status, tableOrders),
        orders: (isChild || isParent) ? allInGroup.map((tNum: number) => {
          const tFloor = floorByNumber.get(tNum);
          const tOrder = tFloor?.current_order_id ? currentOrderMap.get(tFloor.current_order_id) : null;
          return tOrder || ordersByTable[tNum]?.[0] || null;
        }).filter(Boolean) : tableOrders,
        reservation_name: reservation?.name || f.reservation_name,
        reservation_phone: reservation?.phone || f.reservation_phone,
        reservation_time: reservation?.time || f.reservation_time,
        pre_order: hasPreOrder,
      };

      floorMap[fn].tables.push(processedTable);

      if (isParent && !floorMap[fn].merged_groups.find((g: any) => g.id === `group-${f.table_number}`)) {
        const cAggs = childrenNums.map((ctn: number) => {
          const cFloor = floorByNumber.get(ctn);
          const cOrders = ordersByTable[ctn] || [];
          const cSum = openOrderSums(cOrders as any);
          return {
            floor: cFloor,
            guest_count: cFloor?.guest_count ?? (cSum.guests || null),
            total_amount: cSum.total,
          };
        });
        floorMap[fn].merged_groups.push({
          id: `group-${f.table_number}`,
          parent: { ...processedTable },
          children: cAggs,
          total_guests: agg.guest_count,
          total_amount: agg.total_amount,
        });
      }
    });

    const result = Object.values(floorMap).map((f: any) => ({
      ...f,
      tables: f.tables.sort((a: any, b: any) => a.table_number - b.table_number),
    }));

    return NextResponse.json({ floors: result }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
