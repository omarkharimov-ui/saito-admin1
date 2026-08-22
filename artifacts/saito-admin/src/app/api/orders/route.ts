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
    const orderSource = searchParams.get('order_source');
    const tableNumber = searchParams.get('table_number');

    // Build the orders query. Accept both plain equality values (status=confirmed)
    // and PostgREST exclusion expressions (status=not.in.(paid,cancelled,closed)).
    const orderFilters: string[] = [];
    if (statusFilter) {
      const trimmed = statusFilter.trim();
      const notInMatch = trimmed.match(/^not\.in\.\(([^)]*)\)$/);
      if (notInMatch) {
        const values = notInMatch[1].split(',').map((v) => v.trim()).filter(Boolean);
        if (values.length > 0) {
          orderFilters.push(`status=not.in.(${values.join(',')})`);
        }
      } else {
        const statusParams = trimmed.split(',').filter(Boolean);
        for (const s of statusParams) {
          orderFilters.push(`status=eq.${encodeURIComponent(s.trim())}`);
        }
      }
    }
    if (orderSource) {
      orderFilters.push(`order_source=eq.${encodeURIComponent(orderSource)}`);
    }
    if (tableNumber) {
      orderFilters.push(`table_number=eq.${encodeURIComponent(tableNumber)}`);
    }

    let ordersQuery = `${svc().url}/rest/v1/orders?select=*,campaigns(name),order_items(*,products(image_url,name_az,name_en,name_ru,translations))&order=created_at.desc`;
    if (orderFilters.length > 0) {
      ordersQuery += `&${orderFilters.join('&')}`;
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
    console.log('[API /orders POST] received', { action, hasId: !!id, table_number: body.table_number, items: body.items?.length, order_type: body.order_type, order_source: body.order_source });

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

      const { table_number, items, status, guest_count, customer_note, order_type, reservation_id, kitchen_status, customer_id, customer_name, discount_amount, discount_type, campaign_id, order_source, customer_phone, delivery_address, delivery_district, delivery_street, delivery_building, delivery_floor, delivery_apartment, delivery_intercom, delivery_zone, delivery_fee, estimated_delivery_time, scheduled_date, payment_method, is_rush, assigned_to, terminal_id } = body;
      
      // Append items to an EXISTING active order (used by reservation-handoff tables
      // that already have a draft/active order, so we never create a 2nd active order).
      if (action === 'addItems') {
        if (!id || !items?.length) throw new Error('id and items required');

        const insertRes = await fetch(`${svc().url}/rest/v1/order_items`, {
          method: 'POST',
          headers: { ...svc().headers, 'Prefer': 'return=representation' },
          body: JSON.stringify(
            items.map((i: any) => ({
              order_id: id,
              product_id: i.product_id,
              product_name: i.product_name,
              variant_id: i.variant_id || null,
              quantity: i.quantity || 1,
              unit_price: i.unit_price || 0,
              total_price: (i.unit_price || 0) * (i.quantity || 1),
              modifiers: i.modifiers || [],
              special_notes: i.special_notes || '',
              kitchen_status: 'pending',
            }))
          ),
        });
        if (!insertRes.ok) {
          const errText = await insertRes.text();
          if (insertRes.status === 409 || errText.includes('unique') || errText.includes('duplicate')) {
            throw new Error('CONCURRENCY_CONFLICT');
          }
          throw new Error(`Add items failed: ${errText}`);
        }

        // Mark the order active (in case it was still a draft) and recompute total.
        const totalRes = await fetch(`${svc().url}/rest/v1/order_items?select=total_price&order_id=eq.${id}`, { headers: svc().headers });
        const totalRows: any[] = await totalRes.json();
        const newTotal = (totalRows || []).reduce((s: number, r: any) => s + (Number(r.total_price) || 0), 0);
        await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ total_amount: newTotal, is_draft: false, status: 'confirmed', updated_at: new Date().toISOString() }),
        });

        const updatedRes = await fetch(
          `${svc().url}/rest/v1/orders?id=eq.${id}&select=id,total_amount,status`,
          { headers: svc().headers }
        );
        const updated = (await updatedRes.json())?.[0];
        return updated || { id };
      }

      // Takeaway/delivery orders have no table; only dine-in requires one.
      const isTakeawayDelivery = order_type === 'takeaway' || order_type === 'delivery' || order_source === 'takeaway' || order_source === 'delivery';

      if (!items?.length) {
        throw new Error('items required');
      }
      if (!table_number && !isTakeawayDelivery) {
        throw new Error('table_number and items required');
      }

      const effectiveOrderType = order_type || order_source || 'dine_in';
      if ((effectiveOrderType === 'delivery') && (!customer_phone || !delivery_address)) {
        throw new Error('customer_phone and delivery_address are required for delivery orders');
      }
      if ((effectiveOrderType === 'takeaway') && !customer_phone) {
        throw new Error('customer_phone is required for takeaway orders');
      }
      if (effectiveOrderType === 'delivery' && (delivery_fee === undefined || delivery_fee === null || Number.isNaN(Number(delivery_fee)))) {
        throw new Error('delivery_fee must be a valid number');
      }

      // Single source of truth for pricing: each item's unit_price is already
      // the FINAL (post-campaign) price by the time it reaches the server
      // (see usePos.placeOrder / addToCart, which bake the item discount into
      // unit_price). The order-level discount_amount is stored as METADATA for
      // receipts/analytics and is only reduced from the total when it is a
      // genuine order-level PERCENTAGE discount (which the client does not bake
      // into unit_price). We deliberately do NOT subtract a fixed discount here,
      // otherwise the discount would be applied twice (once in unit_price, once
      // here).
      const rawDiscount = Number(discount_amount) || 0;
      const totalFromItems = items.reduce((s: number, i: any) => s + ((i.unit_price || 0) * (i.quantity || 1)), 0);
      let discountedTotal = totalFromItems;
      if (rawDiscount > 0 && discount_type === 'percentage') {
        discountedTotal = totalFromItems * (1 - rawDiscount / 100);
      }

      // Check for existing active order on this table (dine-in only; takeaway
      // and delivery always create a fresh order)
      let existingOrder = null;
      if (table_number) {
        const existingRes = await fetch(
          `${svc().url}/rest/v1/orders?table_number=eq.${table_number}&status=not.in.(paid,cancelled)&order=created_at.asc&limit=1&select=id,total_amount,version`,
          { headers: svc().headers }
        );
        const existingOrders = existingRes.ok ? await existingRes.json() : [];
        existingOrder = existingOrders?.[0];
      }

      let activeOrderId: string;
      const ks = kitchen_status || 'pending';

      if (existingOrder) {
        // Append to existing order.
        // The previously stored total_amount already reflects all earlier
        // discounts (it is the sum of final item unit_prices). We add only the
        // new items' final price total — we must NOT re-subtract rawDiscount,
        // otherwise the discount would be applied again on top of an already
        // discounted total.
        activeOrderId = existingOrder.id;
        const newTotal = (existingOrder.total_amount || 0) + discountedTotal;
        const newVersion = (existingOrder.version || 0) + 1;

        // Accumulate discount metadata; the new send only carries its own
        // delta, so add it to whatever was already recorded.
        const accumulatedDiscount = (Number(existingOrder.discount_amount) || 0) + rawDiscount;

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
            customer_phone: customer_phone || null,
            delivery_address: delivery_address || null,
            delivery_district: delivery_district || null,
            delivery_street: delivery_street || null,
            delivery_building: delivery_building || null,
            delivery_fee: delivery_fee || 0,
            estimated_delivery_time: estimated_delivery_time || null,
            scheduled_date: scheduled_date || null,
            payment_method: payment_method || null,
            is_rush: is_rush || false,
            assigned_to: assigned_to || null,
            order_type: order_type || order_source || 'dine_in',
            order_source: order_source || order_type || 'dine_in',
            updated_by_terminal_id: terminal_id || null,
            discount_amount: accumulatedDiscount,
            discount_type: discount_type || existingOrder.discount_type || null,
            campaign_id: campaign_id || existingOrder.campaign_id || null,
          }),
        });
        if (!patchRes.ok) throw new Error('CONCURRENCY_CONFLICT');
        const patched = await patchRes.json();
        if (!patched || (Array.isArray(patched) && patched.length === 0)) throw new Error('CONCURRENCY_CONFLICT');

        // Update table_floors total_amount and keep current_order_id (SSOT)
        const tableOrdersRes = await fetch(`${svc().url}/rest/v1/orders?table_number=eq.${table_number}&status=not.in.(paid,cancelled)`, { headers: svc().headers });
        const tableOrders = tableOrdersRes.ok ? await tableOrdersRes.json() : [];
        const tableTotal = tableOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
        const tablePatchRes2 = await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
          method: 'PATCH', headers: svc().headers,
          body: JSON.stringify({ total_amount: tableTotal, status: 'occupied', last_activity_at: new Date().toISOString() }),
        });
        if (!tablePatchRes2.ok) {
          const errText = await tablePatchRes2.text();
          console.error('[POST /api/orders] table_floors update failed:', tablePatchRes2.status, errText);
        }
      } else {
        // Create new order
        console.log('[API /orders POST] creating order', { table_number, status: status || 'confirmed', total_amount: discountedTotal });
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
            created_by: auth.user?.id || null,
            kitchen_status: ks,
            reservation_id: reservation_id || null,
            is_draft: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 1,
            order_source: order_source || order_type || 'dine_in',
            customer_phone: customer_phone || null,
            delivery_address: delivery_address || null,
            delivery_district: delivery_district || null,
            delivery_street: delivery_street || null,
            delivery_building: delivery_building || null,
            delivery_floor: delivery_floor || null,
            delivery_apartment: delivery_apartment || null,
            delivery_intercom: delivery_intercom || null,
            delivery_zone: delivery_zone || null,
            delivery_fee: delivery_fee || 0,
            estimated_delivery_time: estimated_delivery_time || null,
            scheduled_date: scheduled_date || null,
            payment_method: payment_method || null,
            is_rush: is_rush || false,
            assigned_to: assigned_to || null,
            updated_by_terminal_id: terminal_id || null,
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

        // Mark table as occupied with current_order_id (SSOT)
        if (table_number) {
          console.log('[API /orders POST] updating table_floors', { table_number, activeOrderId });
          const tablePatchRes3 = await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
            method: 'PATCH', headers: svc().headers,
            body: JSON.stringify({ status: 'occupied', current_order_id: activeOrderId, total_amount: discountedTotal, last_activity_at: new Date().toISOString() }),
          });
          console.log('[API /orders POST] table_floors update result:', tablePatchRes3.status);
          if (!tablePatchRes3.ok) {
            const errText = await tablePatchRes3.text();
            console.error('[POST /api/orders] table_floors update failed:', tablePatchRes3.status, errText);
          }
        }
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
          is_combo_parent: !!i.is_combo,
          combo_group_id: i.combo_id || null,
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
          // Rollback: soft-delete the order (status=cancelled) instead of hard delete
          await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
          });
          throw new Error(`Order item insert failed: ${await itemRes.text()}`);
        }
      }

      // The create_order_with_items RPC does not accept reservation_id / customer_id,
      // so persist them with a direct PATCH on the freshly created order.
      if (reservation_id || customer_id) {
        await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({
            ...(reservation_id ? { reservation_id } : {}),
            ...(customer_id ? { customer_id } : {}),
          }),
        });
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
