import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || 'today';

    // Calculate date range
    const now = new Date();
    let isoStartDate: string;
    let isoEndDate: string = now.toISOString();

    switch (timeFilter) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        isoStartDate = today.toISOString();
        break;
      case 'week':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        isoStartDate = weekAgo.toISOString();
        break;
      case 'month':
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        isoStartDate = monthAgo.toISOString();
        break;
      case '3months':
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        isoStartDate = threeMonthsAgo.toISOString();
        break;
      case 'year':
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        isoStartDate = yearAgo.toISOString();
        break;
      default:
        const defaultStart = new Date();
        defaultStart.setHours(0, 0, 0, 0);
        isoStartDate = defaultStart.toISOString();
    }

    // Fetch all data in parallel
    const [
      ordersRes,
      orderItemsRes,
      productsRes,
      categoriesRes,
      cancelledOrdersRes
    ] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,total_amount,created_at,status,table_number&status=eq.paid&created_at=gte.${isoStartDate}&created_at=lte.${isoEndDate}&order=created_at.asc`, {
        headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/order_items?select=*,order:orders!inner(id,status,created_at)&order.status=eq.paid&order.created_at=gte.${isoStartDate}&order.created_at=lte.${isoEndDate}`, {
        headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,price,image_url,views_count,category:categories(id,name)`, {
        headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/categories?select=id,name,translations&order=name`, {
        headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/cancelled_orders?select=*&created_at=gte.${isoStartDate}`, {
        headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      }),
    ]);

    const [orders, orderItems, products, categories, cancelledOrders] = await Promise.all([
      ordersRes.json(),
      orderItemsRes.json(),
      productsRes.json(),
      categoriesRes.json(),
      cancelledOrdersRes.json(),
    ]);

    // Calculate stats
    const totalRevenue = orders?.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0) || 0;
    const totalOrders = orders?.length || 0;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Peak hours
    const hourMap: Record<number, number> = {};
    orders?.forEach((o: any) => {
      const h = new Date(o.created_at).getHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
    });
    const peakHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] || 0 }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Product performance
    const productMap = new Map();
    orderItems?.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      const existing = productMap.get(pid) || { sold: 0, revenue: 0 };
      existing.sold += item.quantity || 0;
      existing.revenue += item.total_price || 0;
      productMap.set(pid, existing);
    });

    const productPerformance = products?.map((p: any) => {
      const stats = productMap.get(p.id) || { sold: 0, revenue: 0 };
      return {
        id: p.id,
        name: p.name,
        image: p.image_url,
        sold: stats.sold,
        revenue: stats.revenue,
        views: p.views_count || 0,
      };
    }).sort((a: any, b: any) => b.revenue - a.revenue) || [];

    // Cancellation reasons
    const cancellationMap: Record<string, { count: number; amount: number }> = {};
    cancelledOrders?.forEach((c: any) => {
      const reason = c.reason || 'unknown';
      if (!cancellationMap[reason]) cancellationMap[reason] = { count: 0, amount: 0 };
      cancellationMap[reason].count++;
      cancellationMap[reason].amount += Number(c.total_amount) || 0;
    });

    const cancellationReasons = Object.entries(cancellationMap).map(([reason, data]) => ({
      reason,
      count: data.count,
      amount: data.amount,
    }));

    return NextResponse.json({
      totalRevenue,
      totalOrders,
      aov,
      peakHours,
      productPerformance,
      cancellationReasons,
      chartData: orders || [],
    });

  } catch (error: any) {
    console.error('[Stats API] Error:', error);
    return NextResponse.json(
      { error: 'API xətası: ' + (error.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
