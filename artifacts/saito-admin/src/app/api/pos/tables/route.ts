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
      if (!floorMap[fn]) floorMap[fn] = { name: fn, tables: [], merged_groups: [] };

      const tableOrders = ordersByTable[f.table_number] || [];
      
      // Determine if this is a parent or a child
      const isParent = parentToChildren[f.table_number] !== undefined;
      const isChild = f.merged_into_table !== null;
      const parentTableNumber = isChild ? f.merged_into_table : f.table_number;
      
      const childrenNums = parentToChildren[parentTableNumber] || [];
      const allInGroup = [parentTableNumber, ...childrenNums];
      
      // Aggregate data for the whole group
      let groupTotalAmount = 0;
      let groupGuestCount = 0;
      let groupOrderIds: string[] = [];
      let groupLastActivity: string | null = null;
      
      allInGroup.forEach(tNum => {
        const tOrders = ordersByTable[tNum] || [];
        groupTotalAmount += tOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
        
        const tableObj = rawFloors.find((rf: any) => rf.table_number === tNum);
        if (tableObj?.guest_count) groupGuestCount += tableObj.guest_count;
        else if (tOrders.length > 0) groupGuestCount += tOrders.reduce((s, o) => s + Number(o.guest_count || 0), 0);
        
        groupOrderIds = [...groupOrderIds, ...tOrders.map(o => o.id)];
        tOrders.forEach(o => {
          if (o.updated_at && (!groupLastActivity || o.updated_at > groupLastActivity)) {
            groupLastActivity = o.updated_at;
          }
        });
      });

      const processedTable = {
        ...f,
        last_activity_at: groupLastActivity,
        status: (ordersByTable[f.table_number]?.length || 0) > 0 ? 'occupied' : f.status,
        total_amount: isChild || isParent ? groupTotalAmount : tableOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
        guest_count: isChild || isParent ? (groupGuestCount || 1) : (f.guest_count || tableOrders.reduce((s, o) => s + Number(o.guest_count || 0), 0)),
        merged_with: isChild || isParent ? allInGroup : [],
        is_group: isChild || isParent,
        parent_table_number: parentTableNumber,
        order_ids: isChild || isParent ? groupOrderIds : tableOrders.map(o => o.id)
      };

      floorMap[fn].tables.push(processedTable);

      // Also maintain a separate merged_groups list for the modal/ActionSheet
      if (isParent && !floorMap[fn].merged_groups.find((g: any) => g.id === `group-${f.table_number}`)) {
        const parentOrders = ordersByTable[f.table_number] || [];
        floorMap[fn].merged_groups.push({
          id: `group-${f.table_number}`,
          parent: { ...processedTable, total_amount: parentOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0) },
          children: childrenNums.map(ctn => {
            const cTable = rawFloors.find((rf: any) => rf.table_number === ctn);
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
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
