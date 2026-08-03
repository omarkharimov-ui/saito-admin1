import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

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
    const [floorsRes, ordersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=*&status=neq.paid&status=neq.cancelled&order=created_at.desc`, { headers }),
    ]);

    const rawFloors = await floorsRes.json();
    const rawOrders = await ordersRes.json();

    // Fetch reservations to check VIP status and pre-order counts
    const reservationsRes = await fetch(`${SUPABASE_URL}/rest/v1/reservations?select=id,is_vip,pre_order_items&status=eq.confirmed`, { headers });
    const rawReservations = await reservationsRes.json();
    const reservationsById: Record<string, any> = {};
    if (Array.isArray(rawReservations)) {
      rawReservations.forEach((r: any) => {
        if (r.id) reservationsById[r.id] = r;
      });
    }

    // Fetch reservation pre-order items for ALL reservations (not just confirmed) to catch any active pre-orders
    const allReservationsRes = await fetch(`${SUPABASE_URL}/rest/v1/reservations?select=id,pre_order_items&status=not.in.(cancelled,no_show,expired,completed)`, { headers });
    const rawAllReservations = await allReservationsRes.json();
    const allReservationsById: Record<string, any> = {};
    if (Array.isArray(rawAllReservations)) {
      rawAllReservations.forEach((r: any) => {
        if (r.id) allReservationsById[r.id] = r;
      });
    }

    // Compute pre-order count per reservation safely
    const preOrderCountByReservation: Record<string, number> = {};
    Object.entries(allReservationsById).forEach(([rid, r]: [string, any]) => {
      try {
        const items = typeof r.pre_order_items === 'string' ? JSON.parse(r.pre_order_items) : r.pre_order_items;
        const count = Array.isArray(items) ? items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0) : 0;
        if (count > 0) preOrderCountByReservation[rid] = count;
      } catch {
        // ignore parse errors
      }
    });

    const ordersByTable: Record<number, any[]> = {};
    const kitchenStatusByTable: Record<number, string> = {};
    const orderIdsByTable: Record<number, string[]> = {};
    const assignedToByTable: Record<number, string | null> = {};
    const waiterNameByTable: Record<number, string | null> = {};
    const reservationVipByTable: Record<number, boolean> = {};
    rawOrders.forEach((o: any) => {
      if (!ordersByTable[o.table_number]) ordersByTable[o.table_number] = [];
      ordersByTable[o.table_number].push(o);
      if (o.kitchen_status && !kitchenStatusByTable[o.table_number]) {
        kitchenStatusByTable[o.table_number] = o.kitchen_status;
      }
      if (o.id) {
        orderIdsByTable[o.table_number] = [...(orderIdsByTable[o.table_number] || []), o.id];
      }
      if (o.created_by && !assignedToByTable[o.table_number]) {
        assignedToByTable[o.table_number] = o.created_by;
      }
      if (o.reservation_id && reservationsById[o.reservation_id]?.is_vip) {
        reservationVipByTable[o.table_number] = true;
      }
    });

    // Fetch waiter names from profiles
    const allWaiterIds = Object.values(assignedToByTable).filter(Boolean);
    const waiterNames: Record<string, string> = {};
    if (allWaiterIds.length > 0) {
      const orFilter = allWaiterIds.map(id => `id.eq.${id}`).join(',');
      const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,name&or=(${orFilter})`, { headers });
      const profiles = await profilesRes.json();
      if (Array.isArray(profiles)) {
        profiles.forEach((p: any) => {
          if (p.id) waiterNames[p.id] = p.name || '';
        });
      }
    }

    const floorMap: Record<string, any> = {};
    const childTableNumbers = new Set<number>();
    const parentToChildren: Record<number, number[]> = {};
    const tableNumberToFloor = new Map<number, any>();

    const KITCHEN_STATUS_RANK: Record<string, number> = {
      pending: 0,
      accepted: 1,
      preparing: 2,
      ready: 3,
      completed: 4,
      served: 5,
      cancelled: 6,
    };

    rawFloors.forEach((f: any) => {
      tableNumberToFloor.set(f.table_number, f);
      if (f.merged_into_table) {
        childTableNumbers.add(f.table_number);
        if (!parentToChildren[f.merged_into_table]) parentToChildren[f.merged_into_table] = [];
        parentToChildren[f.merged_into_table].push(f.table_number);
      }
    });

    rawFloors.forEach((f: any) => {
      const fn = f.floor_name || 'Main';
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [], merged_groups: [] };

      const tableOrders = ordersByTable[f.table_number] || [];
      const isParent = parentToChildren[f.table_number] !== undefined;
      const isChild = f.merged_into_table !== null;
      const parentTableNumber = isChild ? f.merged_into_table : f.table_number;
      const childrenNums = parentToChildren[parentTableNumber] || [];
      const allInGroup = [parentTableNumber, ...childrenNums];

      let groupTotalAmount = 0;
      let groupGuestCount = 0;
      let groupOrderIds: string[] = [];
      let groupLastActivity: string | null = null;
      let groupKitchenStatus: string | null = null;

      allInGroup.forEach(tNum => {
        const tOrders = ordersByTable[tNum] || [];
        groupTotalAmount += tOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
        const tableObj = tableNumberToFloor.get(tNum);
        if (tableObj?.guest_count) groupGuestCount += tableObj.guest_count;
        else if (tOrders.length > 0) groupGuestCount += tOrders.reduce((s, o) => s + Number(o.guest_count || 0), 0);
        groupOrderIds = [...groupOrderIds, ...tOrders.map(o => o.id)];
        tOrders.forEach(o => {
          if (o.updated_at && (!groupLastActivity || o.updated_at > groupLastActivity)) {
            groupLastActivity = o.updated_at;
          }
          const rank = Number(KITCHEN_STATUS_RANK[o.kitchen_status] ?? 99);
          const currentRank = Number(KITCHEN_STATUS_RANK[groupKitchenStatus || ''] ?? 99);
          if (rank < currentRank) {
            groupKitchenStatus = o.kitchen_status || groupKitchenStatus;
          }
        });
      });

      const hasOrders = (ordersByTable[f.table_number]?.length || 0) > 0;
      const computedStatus =
        f.status === 'reserved' || f.status === 'waiting'
          ? f.status
          : hasOrders
            ? 'occupied'
            : f.status;

      const processedTable = {
        ...f,
        last_activity_at: groupLastActivity,
        status: computedStatus,
        order_count: isChild || isParent ? groupOrderIds.length : (orderIdsByTable[f.table_number]?.length || 0),
        total_amount: isChild || isParent ? groupTotalAmount : tableOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0),
        guest_count:
          isChild || isParent
            ? (groupGuestCount || 1)
            : computedStatus === 'reserved' || computedStatus === 'waiting'
              ? f.guest_count
              : hasOrders
                ? (f.guest_count || tableOrders.reduce((s: number, o: any) => s + Number(o.guest_count || 0), 0))
                : null,
        merged_with: isChild || isParent ? allInGroup : [],
        is_group: isChild || isParent,
        parent_table_number: parentTableNumber,
        order_ids: isChild || isParent ? groupOrderIds : (orderIdsByTable[f.table_number] || []),
        kitchen_status: isChild || isParent ? groupKitchenStatus : (kitchenStatusByTable[f.table_number] || null),
        is_vip: reservationVipByTable[f.table_number] || false,
        bill_requested: f.bill_requested || false,
        assigned_to: assignedToByTable[f.table_number] || null,
        waiter_name: assignedToByTable[f.table_number] ? (waiterNames[assignedToByTable[f.table_number] as string] || '') : null,
        has_pre_order: (f.reservation_id ? (preOrderCountByReservation[f.reservation_id] || 0) > 0 : false),
        pre_order_count: f.reservation_id ? (preOrderCountByReservation[f.reservation_id] || 0) : 0,
        current_order_id: tableOrders[0]?.id || orderIdsByTable[f.table_number]?.[0] || null,
      };

      floorMap[fn].tables.push(processedTable);

      if (isParent && !floorMap[fn].merged_groups.find((g: any) => g.id === `group-${f.table_number}`)) {
        const parentOrders = ordersByTable[f.table_number] || [];
        floorMap[fn].merged_groups.push({
          id: `group-${f.table_number}`,
          parent: { ...processedTable, total_amount: parentOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0) },
          children: childrenNums.map(ctn => {
            const cTable = tableNumberToFloor.get(ctn);
            const cOrders = ordersByTable[ctn] || [];
            return {
              ...cTable,
              total_amount: cOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
            };
          }),
          total_guests: groupGuestCount,
          total_amount: groupTotalAmount
        });
      }
    });

    const result = Object.values(floorMap).map(f => ({
      ...f,
      tables: f.tables.sort((a: any, b: any) => a.table_number - b.table_number)
    }));

    return NextResponse.json({ floors: result }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
