import { NextResponse } from 'next/server';
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
    const reservationId = searchParams.get('reservation_id');

    // Build the orders query. Supports:
    //   ?status=paid               → status=eq.paid
    //   ?status=paid,closed        → status=eq.paid&status=eq.closed (OR)
    //   ?status=not.in.(paid,cancelled,closed)  → forwarded as PostgREST not-in
    const orderFilters: string[] = [];
    if (statusFilter) {
      const notInMatch = statusFilter.match(/^not\.in\.\((.+)\)$/);
      if (notInMatch) {
        const excluded = notInMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        if (excluded.length > 0) {
          orderFilters.push(`status=not.in.(${excluded.join(',')})`);
        }
      } else {
        const statusParams = statusFilter.split(',').filter(Boolean);
        for (const s of statusParams) {
          orderFilters.push(`status=eq.${encodeURIComponent(s.trim())}`);
        }
      }
    }
    const tableNumbers = searchParams.getAll('table_number');
    if (tableNumbers.length === 1) {
      orderFilters.push(`table_number=eq.${encodeURIComponent(tableNumbers[0])}`);
    } else if (tableNumbers.length > 1) {
      orderFilters.push(`table_number=in.(${tableNumbers.map(n => encodeURIComponent(n)).join(',')})`);
    }
    if (orderSource) {
      orderFilters.push(`order_source=eq.${encodeURIComponent(orderSource.trim())}`);
    }
    if (reservationId) {
      orderFilters.push(`reservation_id=eq.${encodeURIComponent(reservationId)}`);
    }

    let ordersQuery = `${svc().url}/rest/v1/orders?select=*,campaigns(name),order_items(*,products(image_url,name_az,name_en,name_ru,translations))&order=created_at.desc`;
    if (orderFilters.length > 0) {
      ordersQuery += `&${orderFilters.join('&')}`;
    }

    const [ordersRes, tablesRes, floorsRes] = await Promise.all([
      fetch(ordersQuery, { headers: svc().headers }),
      fetch(`${svc().url}/rest/v1/settings?select=qr_table_count,opening_hours,order_delay_minutes&limit=1`, { headers: svc().headers }),
      fetch(`${svc().url}/rest/v1/table_floors?select=table_number,status,reservation_name,reservation_time`, { headers: svc().headers }),
    ]);

    if (!ordersRes.ok || !tablesRes.ok || !floorsRes.ok) {
      console.error('[API /orders] Fetch error');
      return NextResponse.json({ error: 'Data fetch failed' }, { status: 500 });
    }

    const [orders, settings, tableFloors] = await Promise.all([
      ordersRes.json(),
      tablesRes.json(),
      floorsRes.json(),
    ]);

    return NextResponse.json({
      orders: orders || [],
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
      const orderSource = body.order_source || body.order_type || 'dine_in';
      
      if (action === 'create' || (!action && body.items)) {
        if (orderSource === 'dine_in' && !body.table_number) {
          throw new Error('Dine-in orders require a table number');
        }
        if (orderSource === 'delivery') {
          if (!body.customer_phone) throw new Error('Delivery orders require customer phone');
          if (!body.delivery_address) throw new Error('Delivery orders require delivery address');
          if (body.table_number) throw new Error('Delivery orders cannot have a table number');
        }
        if (orderSource !== 'dine_in' && body.table_number) {
          throw new Error(`${orderSource} orders cannot have a table number`);
        }
      }

      if (action === 'update') {
        const terminalId = body.terminal_id || null;
        const orderRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}&select=id,version,table_number,guest_count,updated_by_terminal_id`, { headers: svc().headers });
        const existingOrder = (await orderRes.json())?.[0];
        
        if (!existingOrder) throw new Error('Order not found');
        
        const lastUpdatedBy = existingOrder.updated_by_terminal_id;
        const isSameTerminal = terminalId && lastUpdatedBy === terminalId;
        
        if (version !== undefined && (existingOrder.version ?? 0) !== version && !isSameTerminal) {
          throw new Error('CONCURRENCY_CONFLICT');
        }

        const currentVersion = existingOrder.version || 0;
        const patchBody: Record<string, any> = { 
          ...data, 
          version: currentVersion + 1,
          updated_by_terminal_id: terminalId,
        };
        
        const patchRes = await fetch(
          `${svc().url}/rest/v1/orders?id=eq.${id}&version=eq.${currentVersion}`,
          {
            method: 'PATCH',
            headers: { ...svc().headers, 'Prefer': 'return=representation' },
            body: JSON.stringify(patchBody),
          }
        );
        if (!patchRes.ok) {
          const errText = await patchRes.text();
          if (patchRes.status === 409 && !errText.includes('unique') && !errText.includes('duplicate')) {
            throw new Error('CONCURRENCY_CONFLICT');
          }
          throw new Error('Update failed');
        }
        const patched = await patchRes.json();
        if (!patched || (Array.isArray(patched) && patched.length === 0)) {
          throw new Error('CONCURRENCY_CONFLICT');
        }

        const updatedOrder = Array.isArray(patched) ? patched[0] : patched;

        // If kitchen_status changed, sync to table_floors for floor view consistency
        if (data.kitchen_status !== undefined && existingOrder.table_number) {
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${existingOrder.table_number}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ kitchen_status: data.kitchen_status, updated_at: new Date().toISOString() }),
          }).catch(() => {});
        }

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

      // ─── updateItemStatus: update individual item kitchen status ───
      if (action === 'updateItemStatus') {
        const { item_id, status: itemStatus } = body;
        if (!item_id || !itemStatus) throw new Error('item_id and status required');
        const res = await fetch(`${svc().url}/rest/v1/order_items?id=eq.${item_id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ kitchen_status: itemStatus }),
        });
        if (!res.ok) throw new Error('Item status update failed');
        return { success: true };
      }

      const { table_number, items, status, guest_count, customer_note, order_type, reservation_id, kitchen_status, customer_id, customer_name, customer_phone, delivery_address, delivery_fee, estimated_delivery_time, payment_method, discount_amount, discount_type, campaign_id, order_source } = body;

      // ─── addItems: append to an EXISTING order ───
      if (action === 'addItems') {
        if (!id || !items?.length) throw new Error('id and items required');
        const terminalId = body.terminal_id || null;

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
              seat_number: i.seat_number || null,
              updated_by_terminal_id: terminalId,
              price_snapshot: {
                unit_price: i.unit_price || 0,
                discount_price: i.original_unit_price ? Math.max(0, (i.original_unit_price || 0) - (i.unit_price || 0)) : null,
                campaign_id: i.campaign_id || null,
                campaign_discount: i.campaign_discount_amount || 0,
                total_price: (i.unit_price || 0) * (i.quantity || 1),
                snapshot_at: new Date().toISOString(),
              },
            }))
          ),
        });
        if (!insertRes.ok) {
          const errText = await insertRes.text();
          if (insertRes.status === 409 && !errText.includes('unique') && !errText.includes('duplicate')) {
            throw new Error('CONCURRENCY_CONFLICT');
          }
          throw new Error(`Add items failed: ${errText}`);
        }

        // Recompute total from items
        const totalRes = await fetch(`${svc().url}/rest/v1/order_items?select=total_price&order_id=eq.${id}`, { headers: svc().headers });
        const totalRows: any[] = await totalRes.json();
        const newTotal = (totalRows || []).reduce((s: number, r: any) => s + (Number(r.total_price) || 0), 0);
        // Reset kitchen_status to 'pending' so KDS picks up the new items
        await fetch(`${svc().url}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ total_amount: newTotal, is_draft: false, status: 'confirmed', kitchen_status: 'pending', updated_at: new Date().toISOString() }),
        });

        const updatedRes = await fetch(
          `${svc().url}/rest/v1/orders?id=eq.${id}&select=id,total_amount,status`,
          { headers: svc().headers }
        );
        const updated = (await updatedRes.json())?.[0];
        return updated || { id };
      }

      // ─── CREATE NEW ORDER ───
      if (!items?.length) {
        throw new Error('items required');
      }

      const finalOrderSource = order_source || order_type || (table_number ? 'dine_in' : 'takeaway');

      if ((finalOrderSource === 'dine_in') && !table_number) {
        throw new Error('table_number is required for dine_in orders');
      }

      // Calculate pricing via RPC
      const calcRes = await fetch(`${svc().url}/rest/v1/rpc/calculate_order_total`, {
        method: 'POST',
        headers: svc().headers,
        body: JSON.stringify({
          p_items: items,
          p_campaign_id: campaign_id || null,
          p_discount_amount: Number(discount_amount) || 0,
          p_discount_type: discount_type || null,
        }),
      });
      const calcData = await calcRes.json();
      if (!calcRes.ok || calcData?.error) {
        throw new Error(calcData?.error || 'Price calculation failed');
      }
      const discountedTotal = calcData.total || 0;

      // Generate order number for takeaway/delivery (daily reset: Gel-Al 1, 2... / Çatdırılma 1, 2...)
      let orderNumber: string | null = null;
      if (finalOrderSource === 'takeaway' || finalOrderSource === 'delivery') {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const numRes = await fetch(`${svc().url}/rest/v1/orders?select=order_number&created_at=gte.${today}T00:00:00&order=created_at.desc&limit=1`, { headers: svc().headers });
          const numData = numRes.ok ? await numRes.json() : [];
          let seq = 1;
          if (numData.length > 0 && numData[0].order_number) {
            const lastNum = parseInt(numData[0].order_number.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(lastNum)) seq = lastNum + 1;
          }
          orderNumber = String(seq);
        } catch {
          orderNumber = String(Math.floor(Math.random() * 999) + 1);
        }
      }

      // Determine initial status & delivery_status
      let initialStatus = status || 'confirmed';
      let deliveryStatus: string | null = null;
      if (finalOrderSource === 'delivery') {
        initialStatus = 'confirmed';
        deliveryStatus = 'pending';
      }

      // Check for existing active order on this table (dine_in only)
      let activeOrderId: string = '';
      const ks = kitchen_status || 'pending';

      if (table_number) {
        const existingRes = await fetch(
          `${svc().url}/rest/v1/orders?table_number=eq.${table_number}&status=not.in.(paid,cancelled)&order=created_at.asc&limit=1&select=id,total_amount,version,discount_amount,discount_type,campaign_id`,
          { headers: svc().headers }
        );
        const existingOrders = existingRes.ok ? await existingRes.json() : [];
        const existingOrder = existingOrders?.[0];

        if (existingOrder) {
          activeOrderId = existingOrder.id;
          const terminalId = body.terminal_id || null;
          const newTotal = (existingOrder.total_amount || 0) + discountedTotal;
          const newVersion = (existingOrder.version || 0) + 1;
          const accumulatedDiscount = (Number(existingOrder.discount_amount) || 0) + (Number(discount_amount) || 0);

          const patchBody: Record<string, any> = {
            total_amount: newTotal,
            version: newVersion,
            kitchen_status: ks,
            updated_at: new Date().toISOString(),
            customer_id: customer_id || null,
            customer_name: customer_name || null,
            customer_phone: customer_phone || null,
            discount_amount: accumulatedDiscount,
            discount_type: discount_type || existingOrder.discount_type || null,
            campaign_id: campaign_id || existingOrder.campaign_id || null,
            updated_by_terminal_id: terminalId,
          };
          
          const patchRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}&version=eq.${existingOrder.version || 0}`, {
            method: 'PATCH',
            headers: { ...svc().headers, 'Prefer': 'return=representation' },
            body: JSON.stringify(patchBody),
          });
          if (!patchRes.ok) {
            const errText = await patchRes.text();
            if (patchRes.status === 409 && !errText.includes('unique') && !errText.includes('duplicate')) {
              throw new Error('CONCURRENCY_CONFLICT');
            }
            throw new Error('CONCURRENCY_CONFLICT');
          }
          const patched = await patchRes.json();
          if (!patched || (Array.isArray(patched) && patched.length === 0)) throw new Error('CONCURRENCY_CONFLICT');

          const tableOrdersRes = await fetch(`${svc().url}/rest/v1/orders?table_number=eq.${table_number}&status=not.in.(paid,cancelled)`, { headers: svc().headers });
          const tableOrders = tableOrdersRes.ok ? await tableOrdersRes.json() : [];
          const tableTotal = tableOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
            method: 'PATCH', headers: svc().headers,
            body: JSON.stringify({ total_amount: tableTotal, status: 'occupied', last_activity_at: new Date().toISOString() }),
          });

          // Still need to insert items below
        } else {
          // No existing order — create new
          const terminalId = body.terminal_id || null;
          const insertRes = await fetch(`${svc().url}/rest/v1/orders`, {
            method: 'POST',
            headers: { ...svc().headers, 'Prefer': 'return=representation' },
            body: JSON.stringify({
              table_number: Number(table_number),
              total_amount: discountedTotal,
              status: initialStatus,
              guest_count: guest_count || 1,
              customer_note: customer_note || null,
              order_type: 'dine_in',
              order_source: 'dine_in',
              customer_id: customer_id || null,
              customer_name: customer_name || null,
              customer_phone: customer_phone || null,
              discount_amount: (Number(discount_amount) || 0),
              discount_type: discount_type || null,
              campaign_id: campaign_id || null,
              created_by: auth.user?.id || null,
              assigned_to: body.assigned_to || null,
              kitchen_status: ks,
              reservation_id: reservation_id || null,
              payment_method: payment_method || null,
              is_draft: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              version: 1,
              updated_by_terminal_id: terminalId,
            }),
          });
          if (!insertRes.ok) {
            const errText = await insertRes.text();
            if (insertRes.status === 409 && !errText.includes('unique') && !errText.includes('duplicate')) throw new Error('CONCURRENCY_CONFLICT');
            throw new Error(`Order creation failed: ${errText}`);
          }
          const created = await insertRes.json();
          activeOrderId = created?.[0]?.id;
          if (!activeOrderId) throw new Error('Order creation failed: no id returned');

          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
            method: 'PATCH', headers: svc().headers,
            body: JSON.stringify({ status: 'occupied', total_amount: discountedTotal, last_activity_at: new Date().toISOString() }),
          });
        }
      } else {
        // No table_number: takeaway or delivery — always create new
        // Retry loop for order_number collision (race between terminals)
        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          // Re-generate order number each attempt
          if (finalOrderSource === 'takeaway' || finalOrderSource === 'delivery') {
            try {
              const today = new Date().toISOString().slice(0, 10);
              const numRes = await fetch(`${svc().url}/rest/v1/orders?select=order_number&created_at=gte.${today}T00:00:00&order=created_at.desc&limit=1`, { headers: svc().headers });
              const numData = numRes.ok ? await numRes.json() : [];
              let seq = 1;
              if (numData.length > 0 && numData[0].order_number) {
                const lastNum = parseInt(numData[0].order_number.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(lastNum)) seq = lastNum + 1;
              }
              orderNumber = String(seq);
            } catch {
              orderNumber = String(Date.now() % 10000);
            }
          }

          const insertRes = await fetch(`${svc().url}/rest/v1/orders`, {
            method: 'POST',
            headers: { ...svc().headers, 'Prefer': 'return=representation' },
            body: JSON.stringify({
              total_amount: discountedTotal + (finalOrderSource !== 'dine_in' ? (Number(delivery_fee) || 0) : 0),
              status: initialStatus,
              guest_count: guest_count || 1,
              customer_note: customer_note || null,
              order_type: finalOrderSource === 'delivery' ? 'delivery' : 'takeaway',
              order_source: finalOrderSource,
              customer_id: customer_id || null,
              customer_name: customer_name || null,
              customer_phone: customer_phone || null,
              delivery_address: delivery_address || null,
              delivery_district: body.delivery_district || null,
              delivery_street: body.delivery_street || null,
              delivery_building: body.delivery_building || null,
              delivery_floor: body.delivery_floor || null,
              delivery_apartment: body.delivery_apartment || null,
              delivery_intercom: body.delivery_intercom || null,
              delivery_zone: body.delivery_zone || null,
              delivery_fee: Number(delivery_fee) || 0,
              estimated_delivery_time: estimated_delivery_time || null,
              scheduled_date: body.scheduled_date || null,
              delivery_status: deliveryStatus,
              order_number: orderNumber,
              discount_amount: (Number(discount_amount) || 0),
              discount_type: discount_type || null,
              campaign_id: campaign_id || null,
              created_by: auth.user?.id || null,
              assigned_to: body.assigned_to || null,
              kitchen_status: ks,
              reservation_id: reservation_id || null,
              payment_method: payment_method || null,
              is_draft: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              version: 1,
            }),
          });
          if (!insertRes.ok) {
            const errText = await insertRes.text();
            if (insertRes.status === 409 && !errText.includes('unique') && !errText.includes('duplicate')) {
              if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
                continue;
              }
              throw new Error('CONCURRENCY_CONFLICT');
            }
            throw new Error(`Order creation failed: ${errText}`);
          }
          const created = await insertRes.json();
          activeOrderId = created?.[0]?.id;
          if (!activeOrderId) throw new Error('Order creation failed: no id returned');
          break;
        }
      }

      // ─── Insert order items ───
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
          seat_number: i.seat_number || null,
          hold_until: i.hold_until || null,
          kitchen_status: 'pending',
          price_snapshot: {
            unit_price: up,
            discount_price: i.original_unit_price ? Math.max(0, (i.original_unit_price || 0) - up) : null,
            campaign_id: i.campaign_id || null,
            campaign_discount: i.campaign_discount_amount || 0,
            total_price: up * qty,
            snapshot_at: new Date().toISOString(),
          },
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
          // Rollback: cancel order + revert table_floors
          await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}`, {
            method: 'PATCH',
            headers: svc().headers,
            body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
          });
          if (table_number) {
            await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
              method: 'PATCH',
              headers: svc().headers,
              body: JSON.stringify({ status: 'empty', total_amount: 0, last_activity_at: new Date().toISOString() }),
            });
          }
          throw new Error(`Order item insert failed: ${await itemRes.text()}`);
        }
      }

      // reservation_id and customer_id are already set in the order INSERT above

      const finalOrderRes = await fetch(`${svc().url}/rest/v1/orders?id=eq.${activeOrderId}&select=*,order_items(*,products(image_url,name_az,name_en,name_ru,translations))`, { headers: svc().headers });
      const finalOrder = (await finalOrderRes.json())?.[0];

      // Update table_floors to reflect active order
      if (table_number) {
        try {
          await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
            method: 'PATCH',
            headers: { ...svc().headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              status: 'occupied',
              current_order_id: activeOrderId,
              last_activity_at: new Date().toISOString(),
            }),
          });
        } catch (tableFloorUpdateError) {
          console.error('[Orders API] table_floors update error:', tableFloorUpdateError);
        }
      }

      return finalOrder || { id: activeOrderId };
    });

    if (!result.success && result.error === 'CONCURRENCY_CONFLICT') {
      return NextResponse.json({ error: 'Sifariş eyni anda başqa terminaldan dəyişdirildi. Yenidən cəhd edin.' }, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
