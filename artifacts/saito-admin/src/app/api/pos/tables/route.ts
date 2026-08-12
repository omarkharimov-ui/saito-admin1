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
    const [floorsRes, ordersRes, reservationsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*)&status=neq.paid&status=neq.cancelled&status=neq.closed&order=created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/reservations?select=*&status=neq.cancelled&status=neq.no_show&status=neq.archived`, { headers }),
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

      // Aggregate group data from table_floors + linked orders
      let groupTotalAmount = 0;
      let groupGuestCount = 0;
      let groupItemCount = 0;
      let groupOrderIds: string[] = [];
      let groupLastActivity: string | null = null;

      allInGroup.forEach((tNum: number) => {
        const tFloor = floorByNumber.get(tNum);
        const tOrder = tFloor?.current_order_id ? currentOrderMap.get(tFloor.current_order_id) : null;
        const tAllOrders = ordersByTable[tNum] || [];

        groupTotalAmount += (tFloor?.total_amount || 0) + tAllOrders.reduce((s: any, o: any) => s + Number(o.total_amount || 0), 0);
        groupGuestCount += (tFloor?.guest_count || 0) || tAllOrders.reduce((s: any, o: any) => s + Number(o.guest_count || 0), 0);
        tAllOrders.forEach((o: any) => {
          groupItemCount += (o.order_items || []).reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
        });
        groupOrderIds = [...groupOrderIds, ...(tFloor?.current_order_id ? [tFloor.current_order_id] : []), ...tAllOrders.map((o: any) => o.id)];
        tAllOrders.forEach((o: any) => {
          if (o.updated_at && (!groupLastActivity || o.updated_at > groupLastActivity)) {
            groupLastActivity = o.updated_at;
          }
        });
      });

      const tableOrders = currentOrder ? [currentOrder] : (ordersByTable[f.table_number] || []);
      const singleOrderIds = f.current_order_id ? [f.current_order_id] : tableOrders.map((o: any) => o.id);

      const processedTable = {
        ...f,
        last_activity_at: groupLastActivity || f.last_activity_at,
        status: (isChild || isParent) ? (status === 'empty' || status === 'dirty' ? 'occupied' : status) : status,
        total_amount: (isChild || isParent) ? groupTotalAmount : (f.total_amount || tableOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0)),
        guest_count: (isChild || isParent) ? (groupGuestCount || 1) : (f.guest_count || tableOrders.reduce((s: any, o: any) => s + Number(o.guest_count || 0), 0)),
        item_count: (isChild || isParent) ? groupItemCount : tableOrders.reduce((s: any, o: any) => s + (o.order_items || []).reduce((si: number, it: any) => si + Number(it.quantity || 0), 0), 0),
        merged_with: isChild || isParent ? allInGroup : [],
        is_group: isChild || isParent,
        parent_table_number: parentTableNumber,
        order_ids: isChild || isParent ? groupOrderIds : singleOrderIds,
        kitchen_status: currentOrder?.kitchen_status || f.kitchen_status || tableOrders[0]?.kitchen_status || null,
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
        const parentOrder = f.current_order_id ? currentOrderMap.get(f.current_order_id) : null;
        floorMap[fn].merged_groups.push({
          id: `group-${f.table_number}`,
          parent: { ...processedTable, total_amount: parentOrder?.total_amount || f.total_amount || 0 },
          children: childrenNums.map((ctn: number) => {
            const cFloor = floorByNumber.get(ctn);
            const cOrder = cFloor?.current_order_id ? currentOrderMap.get(cFloor.current_order_id) : null;
            return {
              ...cFloor,
              total_amount: cOrder?.total_amount || cFloor?.total_amount || 0,
              guest_count: cFloor?.guest_count || cOrder?.guest_count || 1,
            };
          }),
          total_guests: groupGuestCount,
          total_amount: groupTotalAmount,
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
