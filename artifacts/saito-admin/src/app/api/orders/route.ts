import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { runOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    if (!svc().url || !svc().headers['apikey']) {
      console.error('[API /orders] Missing env vars:', { SUPABASE_URL: !!svc().url, SERVICE_ROLE_KEY: !!svc().headers['apikey'] });
      return NextResponse.json({ error: 'Missing Supabase configuration. Restart the dev server after creating .env.local' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    let ordersQuery = `${svc().url}/rest/v1/orders?select=*,campaigns(name),order_items(*,products(image_url,name_az,name_en,name_ru,translations))&order=created_at.desc`;
    if (statusFilter) {
      ordersQuery += `&status=eq.${encodeURIComponent(statusFilter)}`;
    }

    const [ordersRes, itemsRes, tablesRes, floorsRes] = await Promise.all([
      fetch(ordersQuery, { headers: svc().headers }),
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
        const orderRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}&select=id,version,table_number,guest_count`, { headers: svc().headers });
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

        const updatedOrder = Array.isArray(patched) ? patched[0] : patched;

        // If guest_count changed, update table_floors too
        if (data.guest_count !== undefined && existingOrder.table_number) {
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${existingOrder.table_number}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ guest_count: data.guest_count }),
          });
        }

        return updatedOrder;
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

      const { table_number, items, status, guest_count, customer_note, order_type, reservation_id, kitchen_status, customer_id, customer_name, discount_amount, discount_type, campaign_id } = body;
      
      if (!table_number || !items?.length) {
        throw new Error('table_number and items required');
      }

      // Apply a discount (manual or campaign-driven) to the order total so the
      // stored total_amount reflects the real, discounted price.
      const rawDiscount = Number(discount_amount) || 0;
      const totalFromItems = items.reduce((s: number, i: any) => s + ((i.unit_price || 0) * (i.quantity || 1)), 0);
      let discountedTotal = totalFromItems;
      if (rawDiscount > 0) {
        discountedTotal = discount_type === 'percentage'
          ? totalFromItems * (1 - rawDiscount / 100)
          : Math.max(0, totalFromItems - rawDiscount);
      }

      // Check for existing active order on this table
      const existingRes = await fetch(
        `${svc().url}/rest/v1/orders?table_number=eq.${table_number}&status=not.in.(paid,cancelled)&order=created_at.asc&limit=1&select=id,total_amount,version`,
        { headers: svc().headers }
      );
      const existingOrders = existingRes.ok ? await existingRes.json() : [];
      const existingOrder = existingOrders?.[0];

      let activeOrderId: string;
      const ks = kitchen_status || 'pending';

      if (existingOrder) {
        // Append to existing order
        activeOrderId = existingOrder.id;
        const newTotal = (existingOrder.total_amount || 0) + discountedTotal;
        const newVersion = (existingOrder.version || 0) + 1;

        const patchRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}&version=eq.${existingOrder.version || 0}`, {
          method: 'PATCH',
          headers: { ...svc().headers, 'Prefer': 'return=representation' },
          body: JSON.stringify({ 
            total_amount: newTotal, 
            version: newVersion, 
            kitchen_status: ks, 
            updated_at: new Date().toISOString(),
            customer_id: customer_id || null,
            customer_name: customer_name || null,
            discount_amount: rawDiscount,
            discount_type: discount_type || null,
            campaign_id: campaign_id || null,
          }),
        });
        if (!patchRes.ok) throw new Error('CONCURRENCY_CONFLICT');
        const patched = await patchRes.json();
        if (!patched || (Array.isArray(patched) && patched.length === 0)) throw new Error('CONCURRENCY_CONFLICT');

        // Update table_floors total_amount
        const tableOrdersRes = await fetch(`${svc().url}/rest/v1/orders?table_number=eq.${table_number}&status=not.in.(paid,cancelled)`, { headers: svc().headers });
        const tableOrders = tableOrdersRes.ok ? await tableOrdersRes.json() : [];
        const tableTotal = tableOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
        await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
          method: 'PATCH', headers: svc().headers,
          body: JSON.stringify({ total_amount: tableTotal, status: 'occupied', last_activity_at: new Date().toISOString() }),
        });
      } else {
        // Create new order
        const insertRes = await fetch(`${svc().url}/rest/v1/orders`, {
          method: 'POST',
          headers: { ...svc().headers, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            table_number,
            total_amount: discountedTotal,
            status: status || 'confirmed',
            guest_count: guest_count || 1,
            customer_note: customer_note || null,
            order_type: order_type || 'dine_in',
            customer_id: customer_id || null,
            customer_name: customer_name || null,
            discount_amount: rawDiscount,
            discount_type: discount_type || null,
            campaign_id: campaign_id || null,
            kitchen_status: ks,
            is_draft: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 1,
          }),
        });
        if (!insertRes.ok) {
          const errText = await insertRes.text();
          if (insertRes.status === 409 || errText.includes('unique') || errText.includes('duplicate')) throw new Error('CONCURRENCY_CONFLICT');
          throw new Error(`Order creation failed: ${errText}`);
        }
        const created = await insertRes.json();
        activeOrderId = created?.[0]?.id;
        if (!activeOrderId) throw new Error('Order creation failed: no id returned');

        // Mark table as occupied with total
        await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
          method: 'PATCH', headers: svc().headers,
          body: JSON.stringify({ status: 'occupied', total_amount: discountedTotal, last_activity_at: new Date().toISOString() }),
        });
      }

      // Insert order items
      const itemInserts = items.map((i: any) => {
        const qty = i.quantity || 1;
        const up = i.unit_price || 0;
        return {
          order_id: activeOrderId,
          product_id: i.product_id,
          product_name: i.product_name || '',
          quantity: qty,
          unit_price: up,
          total_price: up * qty,
          modifiers: i.modifiers || [],
          special_notes: i.special_notes || '',
          variant_id: i.variant_id || null,
          created_at: new Date().toISOString(),
        };
      });

      for (const ins of itemInserts) {
        const itemRes = await fetch(`${svc().url}/rest/v1/order_items`, {
          method: 'POST',
          headers: svc().headers,
          body: JSON.stringify(ins),
        });
        if (!itemRes.ok) {
          // Rollback: delete the order
          await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}`, { method: 'DELETE', headers: svc().headers });
          throw new Error(`Order item insert failed: ${await itemRes.text()}`);
        }
      }

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
