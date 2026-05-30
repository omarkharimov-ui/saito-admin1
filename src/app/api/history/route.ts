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
    const limit = parseInt(url.searchParams.get('limit') || '200');

    const events: any[] = [];

    // 1. Inventory logs
    if (type === 'all' || type === 'stock') {
      const { data: logs } = await supabase
        .from('inventory_logs')
        .select('id, ingredient_id, type, quantity, unit_cost, note, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (logs && logs.length > 0) {
        const ingIds = [...new Set(logs.map(l => l.ingredient_id).filter(Boolean))];
        const { data: ingMapArr } = ingIds.length > 0
          ? await supabase.from('ingredients').select('id, name').in('id', ingIds)
          : { data: [] };
        const ingMap = new Map((ingMapArr || []).map(i => [i.id, i.name]));

        const typeLabels: Record<string, string> = {
          stock_in: 'Stoka giriş',
          waste: 'İtki',
          adjustment: 'Tənzimləmə',
          order_consumption: 'Sifariş sərfiyyatı',
        };

        logs.forEach((l: any) => {
          events.push({
            id: l.id,
            type: 'stock',
            subType: l.type,
            label: typeLabels[l.type] || l.type,
            entityName: ingMap.get(l.ingredient_id) || (l.ingredient_id || '').slice(0, 8),
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
          products(name, name_az),
          orders(order_number, status)
        `)
        .not('orders', 'is', null)
        .neq('orders.status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (orders) {
        orders.forEach((item: any) => {
          const pName = item.products?.name_az || item.products?.name || (item.product_id || '').slice(0, 8);
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
        .select('id, menu_item_id, instructions, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (recipeHeaders && recipeHeaders.length > 0) {
        const prodIds = [...new Set(recipeHeaders.map(r => r.menu_item_id).filter(Boolean))];
        const { data: prodMapArr } = prodIds.length > 0
          ? await supabase.from('products').select('id, name, name_az').in('id', prodIds)
          : { data: [] };
        const prodMap = new Map((prodMapArr || []).map(p => [p.id, p.name_az || p.name]));

        recipeHeaders.forEach((rh: any) => {
          events.push({
            id: `recipe-${rh.id}`,
            type: 'recipe',
            subType: 'created',
            label: 'Resept yaradıldı',
            entityName: prodMap.get(rh.menu_item_id) || (rh.menu_item_id || '').slice(0, 8),
            quantity: null,
            detail: rh.instructions ? `${rh.instructions.slice(0, 60)}${rh.instructions.length > 60 ? '...' : ''}` : null,
            cost: null,
            date: rh.created_at,
            icon: 'file',
          });
        });
      }
    }

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ events: events.slice(0, limit) });
  } catch (e: any) {
    console.error('History API error:', e);
    return NextResponse.json({ events: [] });
  }
}
