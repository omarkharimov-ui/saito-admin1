import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeTransactionalOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    if (!svc().url || !svc().headers['apikey']) {
      console.error('[API /orders] Missing env vars:', { SUPABASE_URL: !!svc().url, SERVICE_ROLE_KEY: !!svc().headers['apikey'] });
      return NextResponse.json({ error: 'Missing Supabase configuration. Restart the dev server after creating .env.local' }, { status: 500 });
    }

    const [ordersRes, itemsRes, tablesRes, floorsRes] = await Promise.all([
      fetch(`${svc().url}/rest/v1/orders?select=*,order_items(*,products(image_url,name_az,name_en,name_ru,translations))&order=created_at.desc`, { headers: svc().headers }),
      fetch(`${svc().url}/rest/v1/order_items?select=*,products(image_url,name_az,name_en,name_ru,translations)`, { headers: svc().headers }),
      fetch(`${svc().url}/rest/v1/settings?select=qr_table_count,opening_hours&limit=1`, { headers: svc().headers }),
      fetch(`${svc().url}/rest/v1/table_floors?select=table_number,status,reservation_name,reservation_time`, { headers: svc().headers }),
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
        const orderRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}&select=*`, { headers: svc().headers });
        const existingOrder = (await orderRes.json())?.[0];
        
        if (!existingOrder) throw new Error('Order not found');
        if (version !== undefined && existingOrder.version !== undefined && existingOrder.version !== version) {
          throw new Error('CONCURRENCY_CONFLICT');
        }

        const res = await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ 
            ...data, 
            version: (existingOrder.version || 0) + 1 
          }),
        });
        if (!res.ok) throw new Error('Update failed');
        return await res.json();
      }

      if (action === 'delete') {
        const res = await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ 
            status: 'cancelled', 
            cancelled_at: new Date().toISOString() 
          }),
        });
        if (!res.ok) throw new Error('Soft-delete failed');
        return { success: true };
      }

      const { table_number, total_amount, status, order_type, guest_count, customer_note, items, reservation_id } = body;

      if (!table_number || !items?.length) {
        throw new Error('table_number and items required');
      }

      // ── CRITICAL FIX: Find existing active order for this table ──
      // Instead of creating duplicate orders, add items to the existing one
      const existingOrderRes = await fetch(
        `${svc().url}/rest/v1/orders?select=*&table_number=eq.${table_number}&status=neq.paid&status=neq.cancelled&order=created_at.asc`,
        { headers: svc().headers }
      );
      const existingOrders: any[] = await existingOrderRes.json();
      
      let activeOrder: any = null;
      let isNewOrder = false;
      
      if (existingOrders.length > 0) {
        // Use the first active order (oldest = primary)
        activeOrder = existingOrders[0];
      }

      if (!activeOrder) {
        // No active order → create new one
         const orderRes = await fetch(`${svc().url}/rest/v1/orders`, {
           method: 'POST',
           headers: { ...svc().headers, 'Prefer': 'return=representation' },
           body: JSON.stringify({
             table_number,
             total_amount: total_amount || items.reduce((s: number, i: any) => s + i.total_price, 0),
             status: status || 'confirmed',
             guest_count: guest_count || 1,
             customer_note: customer_note || null,
             created_at: new Date().toISOString(),
           }),
         });
        if (!orderRes.ok) throw new Error('Order creation failed');
        activeOrder = (await orderRes.json())?.[0];
        isNewOrder = true;
      } else {
        // Update existing order totals
        const existingTotal = Number(activeOrder.total_amount || 0);
        const newItemsTotal = items.reduce((s: number, i: any) => s + (Number(i.total_price) || (Number(i.unit_price) * Number(i.quantity))), 0);
        
        await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrder.id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({
            total_amount: existingTotal + newItemsTotal,
            version: (activeOrder.version || 0) + 1,
          }),
        });
      }

      // Add items to order (new or existing)
      for (const item of items) {
        const itemTotal = Number(item.total_price) || (Number(item.unit_price) * Number(item.quantity));
        await fetch(`${svc().url}/rest/v1/order_items`, {
          method: 'POST',
          headers: svc().headers,
          body: JSON.stringify({
            order_id: activeOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: itemTotal,
            modifiers: typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers || []),
          }),
        });
      }

      // Get current table floor state for reservation handling
      const floorRes = await fetch(`${svc().url}/rest/v1/table_floors?select=*&table_number=eq.${table_number}`, { headers: svc().headers });
      const floorData = floorRes.ok ? await floorRes.json() : [];
      const currentFloor = floorData?.[0];

      // If table has reservation and this is a NEW order, clear reservation tie
      if (isNewOrder && currentFloor?.reservation_id) {
        await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({
            status: 'occupied',
            reservation_id: null,
            reservation_name: null,
            reservation_phone: null,
            reservation_time: null,
            last_activity_at: new Date().toISOString(),
          }),
        });

        // Link reservation to order and mark as checked_in
        await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrder.id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ reservation_id: currentFloor.reservation_id }),
        }).catch(() => {});

        await fetch(`${svc().url}/rest/v1/reservations?id=eq.${currentFloor.reservation_id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({
            status: 'checked_in',
            checked_in_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      } else if (!isNewOrder) {
        // Existing order — just update activity timestamp
        await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({
            status: 'occupied',
            last_activity_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }

      // Fetch the updated order with items for response
      const finalOrderRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrder.id}&select=*,order_items(*,products(image_url,name_az,name_en,name_ru,translations))`, { headers: svc().headers });
      const finalOrder = (await finalOrderRes.json())?.[0];

      return finalOrder || activeOrder;
    });

    if (!result.success && result.error === 'CONCURRENCY_CONFLICT') {
      return NextResponse.json({ error: 'Order modified by another user' }, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
