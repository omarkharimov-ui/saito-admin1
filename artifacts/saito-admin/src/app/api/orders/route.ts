import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { runOrderAction } from '@/lib/transaction';

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
      delayThreshold: settings?.[0]?.order_delay_minutes ?? null,
      openingHours: settings?.[0]?.opening_hours || null,
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

    const result = await runOrderAction(`Order${action || 'Create'}`, async () => {
      if (action === 'update') {
        const orderRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}&select=id,version`, { headers: svc().headers });
        const existingOrder = (await orderRes.json())?.[0];
        
        if (!existingOrder) throw new Error('Order not found');
        if (version !== undefined && existingOrder.version !== undefined && existingOrder.version !== version) {
          throw new Error('CONCURRENCY_CONFLICT');
        }

        // Conditional PATCH with version filter — if another request updated it
        // between our read and this PATCH, 0 rows will be affected
        const currentVersion = existingOrder.version || 0;
        const patchRes = await fetch(
          `${svc().url}/rest/v1/orders?id=eq.${id}&version=eq.${currentVersion}`,
          {
            method: 'PATCH',
            headers: { ...svc().headers, 'Prefer': 'return=representation' },
            body: JSON.stringify({ 
              ...data, 
              version: currentVersion + 1 
            }),
          }
        );
        if (!patchRes.ok) throw new Error('Update failed');
        const patched = await patchRes.json();
        if (!patched || (Array.isArray(patched) && patched.length === 0)) {
          throw new Error('CONCURRENCY_CONFLICT');
        }
        return Array.isArray(patched) ? patched[0] : patched;
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

      const { table_number, items, status, guest_count, customer_note, order_type, reservation_id } = body;

      if (!table_number || !items?.length) {
        throw new Error('table_number and items required');
      }

      const itemsJson = items.map((i: any) => JSON.stringify({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity || 1,
        unit_price: i.unit_price || 0,
        modifiers: i.modifiers || [],
        special_notes: i.special_notes || '',
        variant_id: i.variant_id || null
      }));

      const rpcRes = await fetch(`${svc().url}/rest/v1/rpc/create_or_append_order`, {
        method: 'POST',
        headers: { ...svc().headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          p_table_number: table_number,
          p_items: '[' + itemsJson.join(',') + ']',
          p_status: status || 'confirmed',
          p_guest_count: guest_count || 1,
          p_customer_note: customer_note || null,
          p_order_type: order_type || 'dine_in',
          p_reservation_id: reservation_id || null,
        }),
      });

      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        if (rpcRes.status === 409 || errText.includes('unique') || errText.includes('duplicate')) {
          throw new Error('CONCURRENCY_CONFLICT');
        }
        throw new Error(`Order creation failed: ${errText}`);
      }

      const rpcResult = await rpcRes.json();
      const activeOrderId = rpcResult?.order_id;
      if (!activeOrderId) throw new Error('Order creation failed: no id returned');

      const finalOrderRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}&select=*,order_items(*,products(image_url,name_az,name_en,name_ru,translations))`, { headers: svc().headers });
      const finalOrder = (await finalOrderRes.json())?.[0];

      return finalOrder || { id: activeOrderId };
    });

    if (!result.success && result.error === 'CONCURRENCY_CONFLICT') {
      return NextResponse.json({ error: 'Order modified by another user' }, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
