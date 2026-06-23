import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

interface Order {
  id: string;
  table_number: number;
  status: string;
  total_amount: number;
  guest_count: number;
  created_at: string;
  kitchen_status: string | null;
  merged_into?: string | null;
}

export async function GET() {
  try {
    const [floorsRes, ordersRes, reservationsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,table_number,status,total_amount,guest_count,created_at,kitchen_status,merged_into&status=neq.paid&order=created_at.desc`, { headers }),
      // Fetch today's confirmed reservations to mark tables as reserved
      fetch(`${SUPABASE_URL}/rest/v1/reservations?select=id,table_number,table_ids,name,time,guests,status,date&status=eq.confirmed&date=eq.${new Date().toISOString().split('T')[0]}`, { headers }),
    ]);

    if (!floorsRes.ok || !ordersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    const floors = await floorsRes.json();
    const orders: Order[] = await ordersRes.json();
    const todayReservations = reservationsRes.ok ? await reservationsRes.json() : [];

    // Build a map of table_number → reservation info for today
    const reservedTables: Record<number, { name: string; time: string; guests: number }> = {};
    if (Array.isArray(todayReservations)) {
      for (const r of todayReservations) {
        if (r.table_number != null) {
          reservedTables[r.table_number] = { name: r.name, time: r.time, guests: r.guests };
        }
        if (r.table_ids) {
          try {
            const ids = typeof r.table_ids === 'string' ? JSON.parse(r.table_ids) : r.table_ids;
            if (Array.isArray(ids)) {
              ids.forEach((tn: number) => {
                if (tn !== r.table_number) reservedTables[tn] = { name: r.name, time: r.time, guests: r.guests };
              });
            }
          } catch {}
        }
      }
    }

    const ordersByTable: Record<number, Order[]> = {};
    for (const o of orders) {
      if (o.table_number == null) continue;
      if (!ordersByTable[o.table_number]) ordersByTable[o.table_number] = [];
      ordersByTable[o.table_number].push(o);
    }

    // Build merge parent → children maps
    // Order-level: orders whose merged_into points to a parent order
    const parentMap: Record<string, { id: string; table_number: number }[]> = {};
    for (const o of orders) {
      if (o.merged_into) {
        if (!parentMap[o.merged_into]) parentMap[o.merged_into] = [];
        parentMap[o.merged_into].push({ id: o.id, table_number: o.table_number });
      }
    }
    // Table-level: tables whose merged_into_table points to a parent table
    const parentTableMap: Record<number, number[]> = {};
    for (const f of floors) {
      if (f.merged_into_table) {
        const parent = f.merged_into_table;
        if (!parentTableMap[parent]) parentTableMap[parent] = [];
        parentTableMap[parent].push(f.table_number);
      }
    }

    const floorMap: Record<string, { name: string; tables: any[] }> = {};

    // First pass: detect which order IDs are children (merged_into set)
    const childOrderIds = new Set<string>();
    for (const o of orders) {
      if (o.merged_into) childOrderIds.add(o.id);
    }

    for (const f of floors) {
      const fn = f.floor_name || 'Main';
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [] };
      const tableOrders = ordersByTable[f.table_number] || [];
      const activeOrders = tableOrders.filter(o => o.status !== 'paid' && o.status !== 'cancelled');
      const hasCooking = activeOrders.some(o => o.kitchen_status === 'cooking' || o.kitchen_status === 'preparing');
      const hasWaitingBill = activeOrders.some(o => o.kitchen_status === 'ready');

      // Pending = not yet accepted by kitchen
      const pendingOrders = activeOrders.filter(o => o.kitchen_status === 'pending' || o.kitchen_status == null);
      const hasPending = pendingOrders.length > 0;
      const oldestPendingAt = pendingOrders.length > 0
        ? pendingOrders.reduce((a, b) => new Date(a.created_at) < new Date(b.created_at) ? a : b).created_at
        : null;

      const oldestOrder = activeOrders.length > 0 ? activeOrders[activeOrders.length - 1] : null;

      // Check if table has merged_into_table set (table-level merge, even without orders)
      const tableLevelMergedInto = f.merged_into_table || null;

      // Check if all active orders on this table are child orders (merged into another)
      const allMerged = activeOrders.length > 0 && activeOrders.every(o => childOrderIds.has(o.id));

      // Determine if this table is a merged child (either via orders or via table-level tracking)
      const isMergedChild = allMerged || (tableLevelMergedInto != null && activeOrders.length === 0);

      // Find parent table number
      let mergedIntoTable: number | null = null;
      if (allMerged) {
        const parentId = activeOrders[0]?.merged_into;
        if (parentId) {
          const parentOrder = orders.find(o => o.id === parentId);
          if (parentOrder) mergedIntoTable = parentOrder.table_number;
        }
      } else if (tableLevelMergedInto != null && activeOrders.length === 0) {
        mergedIntoTable = tableLevelMergedInto;
      }

      // Determine if this table has table-level merged children
      const tableChildren = parentTableMap[f.table_number] || [];

      let status: string;
      if (isMergedChild) status = 'merged';
      else if (activeOrders.length === 0 && tableChildren.length === 0 && !reservedTables[f.table_number]) status = 'empty';
      else if (activeOrders.length === 0 && tableChildren.length > 0) {
        // Parent is empty but has merged children → inherit status from children
        status = 'active';
      } else if (hasWaitingBill) status = 'waiting_bill';
      else if (hasCooking) status = 'cooking';
      else status = 'active';

      // Skip table_number 0 (placeholder rows for empty floors)
      if (f.table_number === 0) continue;

      // Collect merged children for this table (orders whose merged_into points to an order on THIS table)
      const mergedOrders: { id: string; table_number: number }[] = [];
      let childTotal = 0;
      let childGuests = 0;
      for (const o of activeOrders) {
        const children = parentMap[o.id];
        if (children) {
          mergedOrders.push(...children);
          for (const child of children) {
            const childOrder = orders.find(or => or.id === child.id);
            if (childOrder) {
              childTotal += Number(childOrder.total_amount || 0);
              childGuests += Number(childOrder.guest_count || 0);
            }
          }
        }
      }
      // Also include table-level children (tables with merged_into_table pointing to this table)
      for (const childTableNum of tableChildren) {
        // Check if not already included via order-level merge
        const alreadyIncluded = mergedOrders.some(m => m.table_number === childTableNum);
        if (!alreadyIncluded) {
          mergedOrders.push({ id: `table_${childTableNum}`, table_number: childTableNum });
        }
      }

      // For merged (child) tables, only show table number and merged indicator
      // For parent tables, include child totals
      // Override with reserved status if table has an active reservation today
      const reservedInfo = reservedTables[f.table_number];
      if (reservedInfo && activeOrders.length === 0) {
        status = 'reserved';
      }

      const totalAmount = allMerged ? 0 : activeOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      let guestCount = allMerged ? 0 : (activeOrders.reduce((s, o) => s + (o.guest_count || 0), 0) || (activeOrders.length > 0 ? 2 : 0));
      if (status === 'reserved' && reservedInfo) {
        guestCount = reservedInfo.guests;
      }

      floorMap[fn].tables.push({
        id: f.id,
        table_number: f.table_number,
        floor_name: f.floor_name,
        sort_order: f.sort_order,
        status,
        guest_count: guestCount + childGuests,
        reservation_name: status === 'reserved' ? reservedInfo?.name : undefined,
        reservation_time: status === 'reserved' ? reservedInfo?.time : undefined,
        opened_at: oldestOrder?.created_at || null,
        total_amount: totalAmount + childTotal,
        order_count: allMerged ? 0 : activeOrders.length,
        order_ids: allMerged ? [] : activeOrders.map(o => o.id),
        merged_orders: mergedOrders.length > 0 ? mergedOrders : undefined,
        merged_into_table: mergedIntoTable,
        has_pending: hasPending,
        oldest_pending_at: oldestPendingAt,
      });
    }

    const floorsArr = Object.values(floorMap).map(f => ({
      ...f,
      tables: f.tables.sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));

    const allTables = floorsArr.flatMap(f => f.tables);

    return NextResponse.json({ tables: allTables, floors: floorsArr }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
