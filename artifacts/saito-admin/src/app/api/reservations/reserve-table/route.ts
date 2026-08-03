import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';
import { groqChat, parseJsonFromText } from '@/lib/groq';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const body = await request.json();
    const { reservation_id, table_ids, guest_count, pre_order_items, schedule_minutes_before } = body;
    let { table_number } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const resRes = await fetch(
      `${svc().url}/rest/v1/reservations?select=*&id=eq.${reservation_id}`,
      { headers: svc().headers }
    );
    const resData = await resRes.json();
    const reservation = resData?.[0];
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    const checkUrl = `${svc().url}/rest/v1/reservations?select=id,name,time&date=eq.${reservation.date}&status=eq.confirmed`;
    const checkRes = await fetch(checkUrl, { headers: svc().headers });
    const existing = await checkRes.json();

    const requestedTime = new Date(`1970-01-01T${reservation.time}:00`).getTime();
    const buffer = 2 * 60 * 60 * 1000; // 2 hours

    const conflict = existing.find((res: any) => {
      if (res.id === reservation_id) return false;
      const resTime = new Date(`1970-01-01T${res.time}:00`).getTime();
      const isOverlapping = Math.abs(requestedTime - resTime) < buffer;
      const existingTables = typeof res.table_ids === 'string' ? JSON.parse(res.table_ids) : (res.table_ids || []);
      const requestedTables = table_ids;
      const hasTableConflict = requestedTables.some((tId: string) => existingTables.includes(tId));
      return isOverlapping && hasTableConflict;
    });

    if (conflict) {
      return NextResponse.json({ 
        error: `Masa artıq ${conflict.name} tərəfindən saat ${conflict.time}-da rezerv edilib.` 
      }, { status: 409 });
    }

    if (!table_number && table_ids && table_ids.length > 0) {
      const tRes = await fetch(
        `${svc().url}/rest/v1/table_floors?select=table_number&id=eq.${table_ids[0]}`,
        { headers: svc().headers }
      );
      const tData = await tRes.json();
      table_number = tData?.[0]?.table_number;
    }

    if (!table_number) {
      return NextResponse.json({ error: 'table_number could not be resolved' }, { status: 400 });
    }

    // 2.5. Verify all target tables are available
    const validTableIds = (table_ids || []).filter((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    if (validTableIds.length === 0) {
      return NextResponse.json({ error: 'No valid table IDs provided' }, { status: 400 });
    }
    const tablesRes = await fetch(
      `${svc().url}/rest/v1/table_floors?select=id,table_number,status&id=in.(${validTableIds.map((id: string) => id).join(',')})`,
      { headers: svc().headers }
    );
    const targetTables: any[] = await tablesRes.json();
    const nonEmptyTables = targetTables.filter(t => t.status !== 'empty' && t.status !== 'reserved');
    if (nonEmptyTables.length > 0) {
      const occupiedNums = nonEmptyTables.map(t => t.table_number).join(', ');
      return NextResponse.json({
        error: `Masa(lar) artıq istifadə olunur: ${occupiedNums}`
      }, { status: 409 });
    }

    const totalAmount = (pre_order_items || []).reduce(
      (sum: number, item: any) => sum + (item.unit_price * item.quantity),
      0
    );

    // 2.5b. Auto-link a customer by phone (find-or-create) so the reservation
    // and its order are attributed to a real customer record.
    let customerId: string | null = null;
    const guestName = reservation.name || reservation.customer_name || '';
    const guestPhone = reservation.phone || '';
    if (guestPhone) {
      const custRes = await fetch(`${svc().url}/rest/v1/customers?select=*&phone=eq.${encodeURIComponent(guestPhone)}`, {
        headers: svc().headers,
      });
      const existingCustomers: any[] = await custRes.json();
      if (Array.isArray(existingCustomers) && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;
      } else {
        const createRes = await fetch(`${svc().url}/rest/v1/customers`, {
          method: 'POST',
          headers: { ...svc().headers, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            name: guestName || guestPhone,
            phone: guestPhone,
            total_visits: 0,
            total_spent: 0,
            created_at: new Date().toISOString(),
          }),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          const createdCustomer = Array.isArray(created) ? created[0] : created;
          customerId = createdCustomer?.id || null;
        }
      }
    }

    // 3. On confirm: create a draft order for each selected table and
    //    persist pre-order items into order_items. Kitchen sees drafts;
    //    cashier cannot pay until check-in. table_floors become reserved.
    const resolvedTables = table_ids || [];
    const tableNumberMap = new Map<string, number>();
    if (resolvedTables.length > 0) {
      const tablesRes = await fetch(
        `${svc().url}/rest/v1/table_floors?select=id,table_number&id=in.(${resolvedTables.join(',')})`,
        { headers: svc().headers }
      );
      const tablesData: any[] = await tablesRes.json();
      if (Array.isArray(tablesData)) {
        tablesData.forEach((t) => {
          if (t?.id && t?.table_number !== undefined && t?.table_number !== null) {
            tableNumberMap.set(String(t.id), Number(t.table_number));
          }
        });
      }
    }

    const draftOrderIds: string[] = [];
    for (const tid of resolvedTables) {
      const resolvedTableNumber = tableNumberMap.get(String(tid));
      if (!resolvedTableNumber && resolvedTables.length === 1) {
        const tRes = await fetch(
          `${svc().url}/rest/v1/table_floors?select=table_number&id=eq.${tid}`,
          { headers: svc().headers }
        );
        const tData = await tRes.json();
        const fallback = (Array.isArray(tData) ? tData[0] : null)?.table_number;
        if (fallback) tableNumberMap.set(String(tid), Number(fallback));
      }
      const tableNumber = tableNumberMap.get(String(tid));
      if (!tableNumber) continue;

      const preTotalForTable = (pre_order_items || []).reduce(
        (sum: number, item: any) => sum + (item.unit_price * item.quantity),
        0
      );

      const orderPayload: Record<string, any> = {
        table_number: tableNumber,
        reservation_id: reservation_id,
        status: 'confirmed',
        kitchen_status: 'pending',
        is_draft: true,
        guest_count: reservation.guests || guest_count || 2,
        total_amount: preTotalForTable || 0,
        customer_id: customerId,
        customer_name: reservation.name || reservation.customer_name || null,
        customer_note: reservation.note || null,
        order_source: 'dine_in',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      };
      const createRes = await fetch(`${svc().url}/rest/v1/orders`, {
        method: 'POST',
        headers: { ...svc().headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(orderPayload),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        return NextResponse.json({ error: `Draft order create failed: ${errText}` }, { status: 500 });
      }
      const created = await createRes.json();
      const newOrderId = Array.isArray(created) ? created[0]?.id : created?.id;
      if (!newOrderId) {
        return NextResponse.json({ error: 'Draft order create failed: no id returned' }, { status: 500 });
      }
      draftOrderIds.push(newOrderId);

      if (Array.isArray(pre_order_items) && pre_order_items.length > 0) {
        for (const item of pre_order_items) {
          await fetch(`${svc().url}/rest/v1/order_items`, {
            method: 'POST',
            headers: svc().headers,
            body: JSON.stringify({
              order_id: newOrderId,
              product_id: item.product_id,
              product_name: item.product_name,
              variant_id: item.variant_id || null,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: (item.unit_price || 0) * (item.quantity || 1),
              modifiers: item.modifiers || [],
              special_notes: item.special_notes || '',
              kitchen_status: 'pending',
              seat_number: item.seat_number || null,
              price_snapshot: {
                unit_price: item.unit_price || 0,
                discount_price: item.original_unit_price ? Math.max(0, (item.original_unit_price || 0) - (item.unit_price || 0)) : null,
                campaign_id: item.campaign_id || null,
                campaign_discount: item.campaign_discount_amount || 0,
                total_price: (item.unit_price || 0) * (item.quantity || 1),
                snapshot_at: new Date().toISOString(),
              },
            }),
          });
        }
      }
    }

    // 4. Update table_floors status for ALL selected tables
    for (const tid of table_ids) {
      const updateRes = await fetch(`${svc().url}/rest/v1/table_floors?id=eq.${tid}`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify({ 
          status: 'reserved',
          reservation_id: reservation_id,
          reservation_name: reservation.name || reservation.customer_name || null,
          reservation_phone: reservation.phone || null,
          reservation_time: reservation.time || null,
        }),
      });
      if (!updateRes.ok) {
        console.error(`[reserve-table] Failed to update table ${tid}:`, await updateRes.text());
      }
    }

    // 5. Update reservation: clear pre-order copies after draft orders are created
    await fetch(`${svc().url}/rest/v1/reservations?id=eq.${reservation_id}`, {
      method: 'PATCH',
      headers: svc().headers,
      body: JSON.stringify({
        table_number: table_number,
        table_ids: table_ids,
        pre_order_items: [],
        pre_order_total: 0,
        kitchen_scheduled_at: null,
        kitchen_hint_sent: true,
        customer_id: customerId,
        status: 'confirmed',
      }),
    });

    return NextResponse.json({
      success: true,
      table_number,
      draft_order_ids: draftOrderIds,
      kitchen_scheduled_at: null,
      kitchen_hint_sent: true,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
