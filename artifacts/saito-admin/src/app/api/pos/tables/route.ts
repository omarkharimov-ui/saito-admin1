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

    const ordersByTable: Record<number, any[]> = {};
    rawOrders.forEach((o: any) => {
      if (!ordersByTable[o.table_number]) ordersByTable[o.table_number] = [];
      ordersByTable[o.table_number].push(o);
    });

    const floorMap: Record<string, any> = {};
    const childTableNumbers = new Set<number>();
    const parentToChildren: Record<number, number[]> = {};

    // 1. Identify relationships
    rawFloors.forEach((f: any) => {
      if (f.merged_into_table) {
        childTableNumbers.add(f.table_number);
        if (!parentToChildren[f.merged_into_table]) parentToChildren[f.merged_into_table] = [];
        parentToChildren[f.merged_into_table].push(f.table_number);
      }
    });

    // 2. Build final structure
    rawFloors.forEach((f: any) => {
      const fn = f.floor_name || 'Main';
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [] };

      // Hide children
      if (childTableNumbers.has(f.table_number)) return;

      const tableOrders = ordersByTable[f.table_number] || [];
      const childrenNums = parentToChildren[f.table_number] || [];
      
      // Aggregate child data into parent
      let totalAmount = tableOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      let guestCount = f.guest_count || tableOrders.reduce((s, o) => s + Number(o.guest_count || 0), 0);

      childrenNums.forEach(ctn => {
        const childOrders = ordersByTable[ctn] || [];
        totalAmount += childOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
        // Note: guests already in parent floor or accumulated
      });

      floorMap[fn].tables.push({
        ...f,
        status: tableOrders.length > 0 ? 'occupied' : f.status,
        total_amount: totalAmount,
        guest_count: guestCount,
        merged_with: childrenNums.length > 0 ? [f.table_number, ...childrenNums] : [],
        order_ids: tableOrders.map(o => o.id)
      });
    });

    const result = Object.values(floorMap).map(f => ({
      ...f,
      tables: f.tables.sort((a: any, b: any) => a.table_number - b.table_number)
    }));

    return NextResponse.json({ floors: result }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
