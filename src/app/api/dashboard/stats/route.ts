import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const iso = todayStart.toISOString();

    // Daily revenue
    const { data: paidToday } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('status', 'paid')
      .gte('created_at', iso);
    const dailyRevenue = paidToday?.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) ?? 0;

    // Today's orders count
    const { count: todayOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', iso);

    // Active tables
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('table_number')
      .in('status', ['new', 'confirmed']);
    const activeTables = new Set(activeOrders?.map(o => o.table_number).filter(Boolean)).size;

    // Top product
    const { data: todayItems } = await supabase
      .from('order_items')
      .select('product_name, quantity, order:orders!inner(created_at, status)')
      .eq('order.status', 'paid')
      .gte('order.created_at', iso);

    const productCounts: Record<string, number> = {};
    todayItems?.forEach((item: any) => {
      const name = item.product_name || 'Naməlum';
      productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
    });
    const topEntry = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0];
    const topProduct = topEntry ? topEntry[0] : '—';

    return NextResponse.json({
      dailyRevenue,
      todayOrders: todayOrders ?? 0,
      activeTables,
      topProduct
    });
  } catch (error) {
    return NextResponse.json(
      { dailyRevenue: 0, todayOrders: 0, activeTables: 0, topProduct: '—' },
      { status: 500 }
    );
  }
}
