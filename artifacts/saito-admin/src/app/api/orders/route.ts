import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export async function GET() {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('[API /orders] Missing env vars:', { SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE_KEY: !!SERVICE_ROLE_KEY });
      return NextResponse.json({ error: 'Missing Supabase configuration. Restart the dev server after creating .env.local' }, { status: 500 });
    }

    const [ordersRes, itemsRes, tablesRes, floorsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*,products(image_url,name_az,name_en,name_ru,translations))&order=created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/order_items?select=*,products(image_url,name_az,name_en,name_ru,translations)`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/settings?select=qr_table_count,opening_hours&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=table_number,status,reservation_name,reservation_time`, { headers }),
    ]);

    if (!ordersRes.ok || !itemsRes.ok || !tablesRes.ok || !floorsRes.ok) {
      console.error('[API /orders] Fetch error');
      return NextResponse.json({ error: 'Data fetch failed' }, { status: 500 });
    }

    const [orders, orderItems, settings, tableFloors] = await Promise.all([
      ordersRes.json(),
      itemsRes.json(),
      tablesRes.json(),
      floorsRes.json(),
    ]);

    return NextResponse.json({
      orders: orders || [],
      orderItems: orderItems || [],
      tableCount: settings?.[0]?.qr_table_count ?? null,
      delayThreshold: 20,
      openingHours: settings?.[0]?.opening_hours || '09:00-23:00',
      tableStatuses: tableFloors || [],
    });
  } catch (error: any) {
    console.error('[API /orders] Catch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { action, data, id, version } = body;

    if (auth.role === 'kitchen' && action !== 'update') {
      return NextResponse.json({ error: 'Kitchen can only update order status' }, { status: 403 });
    }

    const result = await executeTransactionalOrderAction(`Order${action || 'Create'}`, async () => {
      if (action === 'update') {
        const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}&select=*`, { headers });
        const existingOrder = (await orderRes.json())?.[0];
        
        if (!existingOrder) throw new Error('Order not found');
        if (version !== undefined && existingOrder.version !== undefined && existingOrder.version !== version) {
          throw new Error('CONCURRENCY_CONFLICT');
        }

        const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            ...data, 
            version: (existingOrder.version || 0) + 1 
          }),
        });
        if (!res.ok) throw new Error('Update failed');
        return await res.json();
      }

      if (action === 'delete') {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            status: 'cancelled', 
            cancelled_at: new Date().toISOString() 
          }),
        });
        if (!res.ok) throw new Error('Soft-delete failed');
        return { success: true };
      }

      const { table_number, total_amount, status, order_type, guest_count, customer_note, items } = body;

      if (!table_number || !items?.length) {
        throw new Error('table_number and items required');
      }

      const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          table_number,
          total_amount: total_amount || items.reduce((s: number, i: any) => s + i.total_price, 0),
          status: status || 'confirmed',
          order_type: order_type || 'dine_in',
          guest_count: guest_count || 1,
          customer_note: customer_note || null,
          created_at: new Date().toISOString(),
          version: 1
        }),
      });

      if (!orderRes.ok) throw new Error('Order creation failed');
      const newOrder = (await orderRes.json())?.[0];

      for (const item of items) {
        await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order_id: newOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price || (item.unit_price * item.quantity),
            modifiers: typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers || []),
          }),
        });
      }

      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?table_number=eq.${table_number}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'occupied' }),
      });

      return newOrder;
    });

    if (!result.success && result.error === 'CONCURRENCY_CONFLICT') {
      return NextResponse.json({ error: 'Order modified by another user' }, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
