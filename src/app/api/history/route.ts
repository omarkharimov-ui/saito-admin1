import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: Request) {
  try {
    const supabase = svc();
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'all';
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const events: any[] = [];

    // 1. Inventory logs
    if (type === 'all' || type === 'stock') {
      const { data: logs } = await supabase
        .from('inventory_logs')
        .select('id, ingredient_id, type, quantity, unit_cost, note, created_at, ingredients(name)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (logs) {
        logs.forEach((l: any) => {
          const typeLabels: Record<string, string> = {
            stock_in: 'Stoka giriş',
            waste: 'İtki',
            adjustment: 'Tənzimləmə',
            order_consumption: 'Sifariş sərfiyyatı',
          };
          events.push({
            id: l.id,
            type: 'stock',
            subType: l.type,
            label: typeLabels[l.type] || l.type,
            entityName: l.ingredients?.name || '—',
            quantity: l.type === 'stock_in' ? `+${l.quantity}` : `-${l.quantity}`,
            detail: l.note || null,
            cost: l.unit_cost,
            date: l.created_at,
            icon: l.type === 'stock_in' ? 'plus' : l.type === 'waste' ? 'trash' : l.type === 'adjustment' ? 'adjust' : 'cart',
          });
        });
      }
    }

    // 2. Order items
    if (type === 'all' || type === 'order') {
      const { data: orders } = await supabase
        .from('order_items')
        .select(`
          id, product_id, quantity, unit_price, total_price, created_at,
          products!inner(name, name_az),
          orders!inner(order_number, status)
        `)
        .neq('orders.status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (orders) {
        orders.forEach((item: any) => {
          const pName = item.products?.name_az || item.products?.name || '—';
          events.push({
            id: `order-${item.id}`,
            type: 'order',
            subType: 'sale',
            label: `${item.quantity} ədəd satıldı`,
            entityName: pName,
            quantity: `-${item.quantity}`,
            detail: item.orders?.order_number
              ? `Sifariş #${item.orders.order_number}`
              : null,
            cost: item.total_price,
            date: item.created_at,
            icon: 'shopping',
          });
        });
      }
    }

    // 3. Recipe headers (recipe created/changed)
    if (type === 'all' || type === 'recipe') {
      const { data: recipeHeaders } = await supabase
        .from('recipe_headers')
        .select('id, menu_item_id, instructions, created_at, products!inner(name, name_az)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (recipeHeaders) {
        recipeHeaders.forEach((rh: any) => {
          const pName = rh.products?.name_az || rh.products?.name || '—';
          events.push({
            id: `recipe-${rh.id}`,
            type: 'recipe',
            subType: 'created',
            label: 'Resept yaradıldı',
            entityName: pName,
            quantity: null,
            detail: rh.instructions ? `${rh.instructions.slice(0, 60)}${rh.instructions.length > 60 ? '...' : ''}` : null,
            cost: null,
            date: rh.created_at,
            icon: 'file',
          });
        });
      }
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ events: events.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json({ events: [] });
  }
}
