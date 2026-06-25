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
  reservation_id?: string | null;
}

export async function GET() {
  try {
    // 1. Fetch tables and active orders
    const [floorsRes, ordersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,table_number,status,total_amount,guest_count,created_at,kitchen_status,merged_into,is_draft,reservation_id&status=neq.paid&order=created_at.desc`, { headers }),
    ]);

    if (!floorsRes.ok || !ordersRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch base data' }, { status: 500 });
    }

    const floors = await floorsRes.json();
    const orders: Order[] = await ordersRes.json();

    // 2. Identify all UNIQUE reservation IDs currently active
    const floorResIds = floors.map((f: any) => f.reservation_id).filter(Boolean);
    const orderResIds = orders.map((o: Order) => o.reservation_id).filter(Boolean);
    const uniqueResIds = Array.from(new Set([...floorResIds, ...orderResIds]));

    // 3. BROAD FETCH (Baku Timezone Fixed)
    const todayBaku = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baku' });
    
    let resUrl = `${SUPABASE_URL}/rest/v1/reservations?select=id,name,phone,time,guests,status,date`;
    if (uniqueResIds.length > 0) {
      resUrl += `&or=(id.in.(${uniqueResIds.join(',')}),and(status.eq.confirmed,date.eq.${todayBaku}))`;
    } else {
      resUrl += `&status=eq.confirmed&date=eq.${todayBaku}`;
    }

    // 4. Map orders by table
    const ordersByTable: Record<number, Order[]> = {};
    for (const o of orders) {
      if (o.table_number == null) continue;
      if (!ordersByTable[o.table_number]) ordersByTable[o.table_number] = [];
      ordersByTable[o.table_number].push(o);
    }

    const floorMap: Record<string, { name: string; tables: any[] }> = {};

    // 5. Process each table and link the reservation data
    for (const f of floors) {
      const fn = f.floor_name || 'Main';
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [] };
      
      const tableOrders = ordersByTable[f.table_number] || [];
      const activeOrders = tableOrders.filter(o => o.status !== 'paid' && o.status !== 'cancelled');
      
      // Find the ID to look up
      const currentResId = activeOrders.find(o => o.reservation_id)?.reservation_id || f.reservation_id;
      const reservation = currentResId ? reservationMap[currentResId] : null;

      const isReserved = f.status === 'reserved' || activeOrders.some(o => o.is_draft || o.kitchen_status === 'reserved') || reservation != null;
      
      let status: string;
      if (f.merged_into_table != null) status = 'merged';
      else if (isReserved) status = 'reserved';
      else if (activeOrders.length === 0) status = 'empty';
      else if (activeOrders.some(o => o.kitchen_status === 'ready')) status = 'waiting_bill';
      else if (activeOrders.some(o => o.kitchen_status === 'cooking' || o.kitchen_status === 'preparing')) status = 'cooking';
      else status = 'active';

      // Totals
      const totalAmount = activeOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      let guestCount = activeOrders.reduce((s, o) => s + (o.guest_count || 0), 0) || (activeOrders.length > 0 ? 2 : 0);
      if (reservation) guestCount = reservation.guests || guestCount;

      floorMap[fn].tables.push({
        id: f.id,
        table_number: f.table_number,
        floor_name: f.floor_name,
        sort_order: f.sort_order,
        status,
        guest_count: guestCount,
        // THE FIX: Direct data from 'reservations' table
        reservation_id: currentResId,
        reservation_name: reservation?.name || f.reservation_name || reservation?.phone || f.reservation_phone || null,
        reservation_phone: reservation?.phone || f.reservation_phone,
        reservation_time: reservation?.time ? reservation.time.split(':').slice(0, 2).join(':') : (f.reservation_time ? f.reservation_time.split(':').slice(0, 2).join(':') : null),
        opened_at: activeOrders[0]?.created_at || null,
        total_amount: totalAmount,
        order_count: activeOrders.length,
        order_ids: activeOrders.map(o => o.id),
        merged_into_table: f.merged_into_table,
        has_pending: activeOrders.some(o => o.kitchen_status === 'pending' || o.kitchen_status == null),
      });
    }

    const result = Object.values(floorMap).map(f => ({
      ...f,
      tables: f.tables.sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));

    return NextResponse.json({ tables: result.flatMap(f => f.tables), floors: result }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
