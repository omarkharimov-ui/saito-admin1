import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(req: Request) {
  try {
    const s = svc();
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'today';

    let startDate: string;
    const today = new Date().toISOString().split('T')[0];

    if (period === 'today') {
      startDate = today;
    } else if (period === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().split('T')[0];
    } else {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      startDate = d.toISOString().split('T')[0];
    }

    // Get shifts in period
    const shiftsRes = await fetch(`${s.url}/rest/v1/shifts?opened_at=gte.${startDate}T00:00:00&select=*&closed_at=not.is.null`, { headers: s.headers });
    const shifts = await shiftsRes.json();

    // Calculate labor data
    let totalHours = 0;
    let totalCost = 0;
    const staffMap: Record<string, any> = {};

    for (const shift of Array.isArray(shifts) ? shifts : []) {
      const duration = (new Date(shift.closed_at).getTime() - new Date(shift.opened_at).getTime()) / 3600000;
      totalHours += duration;
      // Simplified cost calculation
      const hourlyRate = 5; // Default
      const cost = duration * hourlyRate;
      totalCost += cost;

      if (!staffMap[shift.staff_id]) {
        staffMap[shift.staff_id] = { staff_id: shift.staff_id, hours: 0, cost: 0, orders: 0, revenue: 0 };
      }
      staffMap[shift.staff_id].hours += duration;
      staffMap[shift.staff_id].cost += cost;
    }

    // Get sales
    const ordersRes = await fetch(`${s.url}/rest/v1/orders?created_at=gte.${startDate}T00:00:00&select=total_amount,created_by`, { headers: s.headers });
    const orders = await ordersRes.json();
    let totalSales = 0;

    for (const order of Array.isArray(orders) ? orders : []) {
      totalSales += order.total_amount || 0;
      if (staffMap[order.created_by]) {
        staffMap[order.created_by].orders += 1;
        staffMap[order.created_by].revenue += order.total_amount || 0;
      }
    }

    return NextResponse.json({
      total_labor_cost: totalCost,
      total_sales: totalSales,
      labor_percentage: totalSales > 0 ? (totalCost / totalSales) * 100 : 0,
      total_hours: totalHours,
      role_breakdown: [],
      staff_breakdown: Object.values(staffMap),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
