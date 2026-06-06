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
  is_served?: boolean;
}

export async function GET() {
  try {
    const [floorsRes, ordersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,table_number,status,total_amount,guest_count,created_at,kitchen_status,merged_into,is_served&status=neq.paid&order=created_at.desc`, { headers }),
    ]);

    if (!floorsRes.ok || !ordersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    const floors = await floorsRes.json();
    const orders: Order[] = await ordersRes.json();

    const ordersByTable: Record<number, Order[]> = {};
    for (const o of orders) {
      if (o.table_number == null) continue;
      if (!ordersByTable[o.table_number]) ordersByTable[o.table_number] = [];
      ordersByTable[o.table_number].push(o);
    }

    // Build merge parent → children map
    const parentMap: Record<string, { id: string; table_number: number }[]> = {};
    for (const o of orders) {
      if (o.merged_into) {
        if (!parentMap[o.merged_into]) parentMap[o.merged_into] = [];
        parentMap[o.merged_into].push({ id: o.id, table_number: o.table_number });
      }
    }

    const floorMap: Record<string, { name: string; tables: any[] }> = {};

    for (const f of floors) {
      const fn = f.floor_name || 'Main';
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [] };
      const tableOrders = ordersByTable[f.table_number] || [];
      const activeOrders = tableOrders.filter(o => o.status !== 'paid' && o.status !== 'cancelled');
      const totalAmount = activeOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const hasCooking = activeOrders.some(o => o.kitchen_status === 'cooking' || o.kitchen_status === 'preparing');
      const hasWaitingBill = activeOrders.some(o => o.kitchen_status === 'ready');
      const oldestOrder = activeOrders.length > 0 ? activeOrders[activeOrders.length - 1] : null;

      let status: string;
      if (activeOrders.length === 0) status = 'empty';
      else if (hasWaitingBill) status = 'waiting_bill';
      else if (hasCooking) status = 'cooking';
      else status = 'active';

      // Skip table_number 0 (placeholder rows for empty floors)
      if (f.table_number === 0) continue;

      // Collect merged children for this table
      const mergedOrders: { id: string; table_number: number }[] = [];
      for (const o of activeOrders) {
        const children = parentMap[o.id];
        if (children) mergedOrders.push(...children);
      }

      floorMap[fn].tables.push({
        id: f.id,
        table_number: f.table_number,
        floor_name: f.floor_name,
        sort_order: f.sort_order,
        status,
        guest_count: activeOrders.reduce((s, o) => s + (o.guest_count || 0), 0) || (activeOrders.length > 0 ? 2 : 0),
        opened_at: oldestOrder?.created_at || null,
        total_amount: totalAmount,
        order_count: activeOrders.length,
        order_ids: activeOrders.map(o => o.id),
        merged_orders: mergedOrders.length > 0 ? mergedOrders : undefined,
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
