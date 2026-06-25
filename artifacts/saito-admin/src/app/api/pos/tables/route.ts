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
  is_draft?: boolean;
}

export async function GET() {
  try {
    const [floorsRes, ordersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,table_number,status,total_amount,guest_count,created_at,kitchen_status,merged_into,is_draft&status=neq.paid&order=created_at.desc`, { headers }),
    ]);

    if (!floorsRes.ok || !ordersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch initial data' }, { status: 500 });
    }

    const floors = await floorsRes.json();
    const orders: Order[] = await ordersRes.json();

    // 1. Robust Reservation Fetching
    const explicitResIds = Array.from(new Set(floors.map((f: any) => f.reservation_id).filter(Boolean)));
    const todayStr = new Date().toISOString().split('T')[0];
    
    let resUrl = `${SUPABASE_URL}/rest/v1/reservations?select=id,table_number,table_ids,name,customer_name,phone,time,guests,status,date`;
    if (explicitResIds.length > 0) {
      resUrl += `&or=(id.in.(${explicitResIds.map(id => `"${id}"`).join(',')}),and(status.eq.confirmed,date.eq.${todayStr}))`;
    } else {
      resUrl += `&status=eq.confirmed&date=eq.${todayStr}`;
    }

    const reservationsRes = await fetch(resUrl, { headers });
    const todayReservations = reservationsRes.ok ? await reservationsRes.json() : [];

    const reservationMap: Record<string, any> = {};
    if (Array.isArray(todayReservations)) {
      todayReservations.forEach(r => {
        reservationMap[r.id] = r;
      });
    }

    const reservedTablesByNum: Record<number, any> = {};
    const idToTableNumber: Record<string, number> = {};
    if (Array.isArray(floors)) {
      for (const f of floors) {
        if (f.id && f.table_number != null) idToTableNumber[f.id] = f.table_number;
      }
    }

    if (Array.isArray(todayReservations)) {
      for (const r of todayReservations) {
        if (r.table_number != null) reservedTablesByNum[r.table_number] = r;
        if (r.table_ids) {
          try {
            const ids = typeof r.table_ids === 'string' ? JSON.parse(r.table_ids) : r.table_ids;
            if (Array.isArray(ids)) {
              ids.forEach((idOrNum: string | number) => {
                const tn = typeof idOrNum === 'string' && idOrNum.includes('-') ? idToTableNumber[idOrNum] : Number(idOrNum);
                if (tn != null && !isNaN(tn)) reservedTablesByNum[tn] = r;
              });
            }
          } catch {}
        }
      }
    }

    // 2. Orders Mapping
    const ordersByTable: Record<number, Order[]> = {};
    for (const o of orders) {
      if (o.table_number == null) continue;
      if (!ordersByTable[o.table_number]) ordersByTable[o.table_number] = [];
      ordersByTable[o.table_number].push(o);
    }

    const parentMap: Record<string, { id: string; table_number: number }[]> = {};
    for (const o of orders) {
      if (o.merged_into) {
        if (!parentMap[o.merged_into]) parentMap[o.merged_into] = [];
        parentMap[o.merged_into].push({ id: o.id, table_number: o.table_number });
      }
    }

    const parentTableMap: Record<number, number[]> = {};
    for (const f of floors) {
      if (f.merged_into_table) {
        const parent = f.merged_into_table;
        if (!parentTableMap[parent]) parentTableMap[parent] = [];
        parentTableMap[parent].push(f.table_number);
      }
    }

    const floorMap: Record<string, { name: string; tables: any[] }> = {};
    const childOrderIds = new Set<string>(orders.filter(o => o.merged_into).map(o => o.id));

    // 3. Process Tables
    for (const f of floors) {
      const fn = f.floor_name || 'Main';
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [] };
      
      const tableOrders = ordersByTable[f.table_number] || [];
      const activeOrders = tableOrders.filter(o => o.status !== 'paid' && o.status !== 'cancelled');
      const hasCooking = activeOrders.some(o => o.kitchen_status === 'cooking' || o.kitchen_status === 'preparing');
      const hasWaitingBill = activeOrders.some(o => o.kitchen_status === 'ready');
      const pendingOrders = activeOrders.filter(o => o.kitchen_status === 'pending' || o.kitchen_status == null);
      const oldestOrder = activeOrders.length > 0 ? activeOrders.reduce((a, b) => new Date(a.created_at) < new Date(b.created_at) ? a : b) : null;

      const resById = f.reservation_id ? reservationMap[f.reservation_id] : null;
      const resByNum = reservedTablesByNum[f.table_number];
      const definitiveRes = resById || resByNum;

      const isMergedChild = f.merged_into_table != null;
      const isReservedOrder = activeOrders.some(o => o.is_draft || o.kitchen_status === 'reserved');
      
      let status: string;
      if (isMergedChild) status = 'merged';
      else if (isReservedOrder || f.status === 'reserved') status = 'reserved';
      else if (activeOrders.length === 0 && !definitiveRes) status = 'empty';
      else if (hasWaitingBill) status = 'waiting_bill';
      else if (hasCooking) status = 'cooking';
      else status = 'active';

      if (definitiveRes && (activeOrders.length === 0 || isReservedOrder)) status = 'reserved';

      // Aggregate children data
      const tableChildren = parentTableMap[f.table_number] || [];
      const childTotal = tableChildren.reduce((sum, tn) => sum + (ordersByTable[tn] || []).reduce((s, o) => s + (childOrderIds.has(o.id) ? 0 : Number(o.total_amount || 0)), 0), 0);
      const childGuests = tableChildren.reduce((sum, tn) => sum + (ordersByTable[tn] || []).reduce((s, o) => s + (childOrderIds.has(o.id) ? 0 : (o.guest_count || 0)), 0), 0);

      const totalAmount = activeOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      let guestCount = activeOrders.reduce((s, o) => s + (o.guest_count || 0), 0) || (activeOrders.length > 0 ? 2 : 0);
      
      if (status === 'reserved' && definitiveRes) guestCount = definitiveRes.guests || guestCount;

      floorMap[fn].tables.push({
        id: f.id,
        table_number: f.table_number,
        floor_name: f.floor_name,
        sort_order: f.sort_order,
        status,
        guest_count: guestCount + childGuests,
        reservation_id: definitiveRes?.id || f.reservation_id,
        reservation_name: definitiveRes?.customer_name || definitiveRes?.name || f.reservation_name || definitiveRes?.phone || f.reservation_phone || definitiveRes?.id?.slice(0, 8),
        reservation_phone: definitiveRes?.phone || f.reservation_phone,
        reservation_time: definitiveRes?.time || f.reservation_time,
        opened_at: oldestOrder?.created_at || null,
        total_amount: totalAmount + childTotal,
        order_count: activeOrders.length,
        order_ids: activeOrders.map(o => o.id),
        merged_into_table: f.merged_into_table,
        has_pending: pendingOrders.length > 0,
        oldest_pending_at: pendingOrders.length > 0 ? pendingOrders.reduce((a, b) => new Date(a.created_at) < new Date(b.created_at) ? a : b).created_at : null,
      });
    }

    const floorsArr = Object.values(floorMap).map(f => ({
      ...f,
      tables: f.tables.sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));

    return NextResponse.json({ tables: floorsArr.flatMap(f => f.tables), floors: floorsArr }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
