import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  const auth = await validateAuth(['admin', 'superadmin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const actualCashCounted = Number(body.actual_cash_counted) || null;
    const notes = body.notes || null;

    const { url, headers: h } = svc();
    if (!url || !h['apikey']) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStart = today.toISOString();
    const tomorrowStart = tomorrow.toISOString();

    const [
      ordersRes,
      orderItemsRes,
      cancelledOrdersRes,
      inventoryLogsRes,
      clockEventsRes,
      prevReportRes,
    ] = await Promise.all([
      fetch(`${url}/rest/v1/orders?select=id,total_amount,created_at,status,payment_method,cash_amount,card_amount,tip_amount&status=eq.paid&created_at=gte.${todayStart}&created_at=lt.${tomorrowStart}`, { headers: h }),
      fetch(`${url}/rest/v1/order_items?select=*,order:orders!inner(id,status,created_at)&order.status=eq.paid&order.created_at=gte.${todayStart}&order.created_at=lt.${tomorrowStart}`, { headers: h }),
      fetch(`${url}/rest/v1/cancelled_orders?select=*&created_at=gte.${todayStart}&created_at=lt.${tomorrowStart}`, { headers: h }),
      fetch(`${url}/rest/v1/inventory_logs?select=*,ingredients!inner(average_cost_per_unit)&created_at=gte.${todayStart}&created_at=lt.${tomorrowStart}`, { headers: h }),
      fetch(`${url}/rest/v1/clock_events?select=*&clock_in=gte.${todayStart}&clock_in=lt.${tomorrowStart}`, { headers: h }),
      fetch(`${url}/rest/v1/daily_reports?select=actual_cash&order=report_date.desc&limit=1`, { headers: h }),
    ]);

    const [orders, orderItems, cancelledOrders, inventoryLogs, clockEvents, prevReports] = await Promise.all([
      ordersRes.json(),
      orderItemsRes.json(),
      cancelledOrdersRes.json(),
      inventoryLogsRes.json(),
      clockEventsRes.json(),
      prevReportRes.json(),
    ]);

    // A. Sales Summary
    const paidOrders = Array.isArray(orders) ? orders : [];
    const totalRevenue = paidOrders.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
    const totalOrders = paidOrders.length;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const itemsSold = Array.isArray(orderItems) ? orderItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0) : 0;

    // B. Payment Method Breakdown
    const cashTotal = paidOrders
      .filter((o: any) => o.payment_method === 'cash')
      .reduce((s: number, o: any) => s + (Number(o.cash_amount) || 0), 0);

    const cardTotal = paidOrders
      .filter((o: any) => o.payment_method === 'card')
      .reduce((s: number, o: any) => s + (Number(o.card_amount) || 0), 0);

    const tipsTotal = paidOrders.reduce((s: number, o: any) => s + (Number(o.tip_amount) || 0), 0);

    const discountsRes = await fetch(`${url}/rest/v1/audit_logs?select=metadata&type=eq.discount&created_at=gte.${todayStart}&created_at=lt.${tomorrowStart}`, { headers: h });
    const discountLogs = await discountsRes.json();
    const discountsTotal = Array.isArray(discountLogs) 
      ? discountLogs.reduce((s: number, d: any) => s + (Number(d.metadata?.discount_amount) || 0), 0)
      : 0;

    // C. Void/Cancel Summary
    const voidCancelledOrders = Array.isArray(cancelledOrders) ? cancelledOrders : [];
    const voidsCount = voidCancelledOrders.length;
    const voidsAmount = voidCancelledOrders.reduce((s: number, c: any) => s + (Number(c.total_amount) || 0), 0);

    const voidReasonsBreakdown: Record<string, { count: number; amount: number }> = {};
    for (const c of voidCancelledOrders) {
      const reason = c.reason || 'other';
      if (!voidReasonsBreakdown[reason]) {
        voidReasonsBreakdown[reason] = { count: 0, amount: 0 };
      }
      voidReasonsBreakdown[reason].count++;
      voidReasonsBreakdown[reason].amount += Number(c.total_amount) || 0;
    }

    // D. Tax Summary
    const VAT_RATE = 0.18;
    const taxableRevenue = totalRevenue;
    const taxCollected = taxableRevenue * VAT_RATE;

    // E. Cash Drawer Reconciliation
    const startingCash = Array.isArray(prevReports) && prevReports.length > 0 
      ? Number(prevReports[0].actual_cash) || 0 
      : 0;

    const cashRefundsRes = await fetch(`${url}/rest/v1/orders?select=paid_amount&status=eq.refunded&created_at=gte.${todayStart}&created_at=lt.${tomorrowStart}`, { headers: h });
    const cashRefunds = await cashRefundsRes.json();
    const cashRefundsTotal = Array.isArray(cashRefunds)
      ? cashRefunds.reduce((s: number, o: any) => s + (Number(o.paid_amount) || 0), 0)
      : 0;

    const expectedCash = startingCash + cashTotal - cashRefundsTotal;
    const actualCash = actualCashCounted ?? 0;
    const cashDifference = actualCash - expectedCash;

    // F. Inventory Impact
    const todayInventoryLogs = Array.isArray(inventoryLogs) ? inventoryLogs : [];
    
    const orderConsumptionLogs = todayInventoryLogs.filter((l: any) => l.type === 'order_consumption');
    const wasteLogs = todayInventoryLogs.filter((l: any) => l.type === 'waste');

    const totalIngredientsConsumed = orderConsumptionLogs.reduce((s: number, l: any) => s + Math.abs(Number(l.quantity) || 0), 0);
    const totalWaste = wasteLogs.reduce((s: number, l: any) => s + Math.abs(Number(l.quantity) || 0), 0);

    const cogs = orderConsumptionLogs.reduce((s: number, l: any) => {
      const costPerUnit = Number(l.cost_per_unit) || Number(l.ingredients?.average_cost_per_unit) || 0;
      return s + Math.abs(Number(l.quantity) || 0) * costPerUnit;
    }, 0);

    // G. Labor Summary
    const todayClockEvents = Array.isArray(clockEvents) ? clockEvents : [];
    let totalStaffHours = 0;
    for (const ev of todayClockEvents) {
      if (ev.clock_in && ev.clock_out) {
        const durationHours = (new Date(ev.clock_out).getTime() - new Date(ev.clock_in).getTime()) / (1000 * 60 * 60);
        totalStaffHours += Math.max(0, durationHours);
      } else if (ev.clock_in) {
        const durationHours = (Date.now() - new Date(ev.clock_in).getTime()) / (1000 * 60 * 60);
        totalStaffHours += Math.max(0, durationHours);
      }
    }

    const HOURLY_RATE = 5;
    const laborCost = totalStaffHours * HOURLY_RATE;

    const rawData = {
      sales: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        aov: Math.round(aov * 100) / 100,
        items_sold: itemsSold,
      },
      payments: {
        cash_total: cashTotal,
        card_total: cardTotal,
        tips_total: tipsTotal,
        discounts_total: discountsTotal,
      },
      voids: {
        count: voidsCount,
        amount: voidsAmount,
        reasons_breakdown: voidReasonsBreakdown,
      },
      tax: {
        taxable_revenue: taxableRevenue,
        tax_collected: taxCollected,
        vat_rate: VAT_RATE,
      },
      cash_drawer: {
        starting_cash: startingCash,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        cash_difference: cashDifference,
      },
      inventory: {
        total_ingredients_consumed: totalIngredientsConsumed,
        total_waste: totalWaste,
        cogs: cogs,
      },
      labor: {
        total_staff_hours: totalStaffHours,
        labor_cost: laborCost,
      },
    };

    const reportDate = today.toISOString().split('T')[0];
    const closedAt = new Date().toISOString();

    const dailyReport = {
      report_date: reportDate,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      aov: Math.round(aov * 100) / 100,
      cash_total: cashTotal,
      card_total: cardTotal,
      tips_total: tipsTotal,
      discounts_total: discountsTotal,
      voids_count: voidsCount,
      voids_amount: voidsAmount,
      tax_collected: taxCollected,
      starting_cash: startingCash,
      expected_cash: expectedCash,
      actual_cash: actualCash,
      cash_difference: cashDifference,
      cogs: Math.round(cogs * 100) / 100,
      labor_cost: Math.round(laborCost * 100) / 100,
      items_sold: itemsSold,
      raw_data: rawData,
      closed_at: closedAt,
      closed_by: auth.user?.id,
      notes,
    };

    const insertReportRes = await fetch(`${url}/rest/v1/daily_reports`, {
      method: 'POST',
      headers: { ...h, 'Prefer': 'return=representation' },
      body: JSON.stringify(dailyReport),
    });

    if (!insertReportRes.ok) {
      const errorText = await insertReportRes.text();
      console.error('[close-day] Failed to insert daily_report:', errorText);
    }

    const auditLog = {
      action: 'close_day',
      user_id: auth.user?.id,
      metadata: {
        report_date: reportDate,
        total_revenue: totalRevenue,
        cash_difference: cashDifference,
        notes,
      },
      created_at: closedAt,
    };

    const auditlogRes = await fetch(`${url}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(auditLog),
    });

    if (!auditlogRes.ok) {
      console.error('[close-day] Failed to insert audit_log');
    }

    const zReport = {
      report_date: reportDate,
      closed_at: closedAt,
      closed_by: auth.user?.id,
      ...rawData,
    };

    return NextResponse.json({ success: true, z_report: zReport });
  } catch (error: any) {
    console.error('[close-day] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}