import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['waiting', 'cancelled', 'no_show', 'expired'],
  waiting: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['pending'],
  no_show: ['pending'],
  expired: ['pending'],
  archived: ['pending'],
};

function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

const TABLE_STATUS_MAP: Record<string, string | null> = {
  confirmed: 'reserved',
  waiting: 'waiting',
  checked_in: 'occupied',
  completed: 'empty',
  cancelled: 'empty',
  no_show: 'empty',
  expired: 'empty',
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { id, reservation_id, status, notes } = await request.json();
    const reservationId = id || reservation_id;

    if (!reservationId || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const s = svc();

    // 1. Fetch current reservation
    const resRes = await fetch(`${s.url}/rest/v1/reservations?select=*&id=eq.${reservationId}`, { headers: s.headers });
    const resData: any[] = await resRes.json();
    const current = resData?.[0];

    if (!current) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // 2. Validate transition
    if (!isValidTransition(current.status, status)) {
      return NextResponse.json({
        error: `Cannot transition from '${current.status}' to '${status}'`,
      }, { status: 409 });
    }

    // 3. Check for active orders before cancelling/no_show/expired
    if (status === 'cancelled' || status === 'no_show' || status === 'expired') {
      const ordersRes = await fetch(
        `${s.url}/rest/v1/orders?select=id,status&reservation_id=eq.${current.id}&status=neq.paid&status=neq.cancelled`,
        { headers: s.headers }
      );
      const activeOrders: any[] = await ordersRes.json();
      if (activeOrders.length > 0) {
        for (const order of activeOrders) {
          await fetch(`${s.url}/rest/v1/orders?id=eq.${order.id}`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
          });
        }
      }

      // 3b. Cancel orphan draft orders with kitchen_status = 'reserved'
      const draftRes = await fetch(
        `${s.url}/rest/v1/orders?select=id&reservation_id=eq.${current.id}&is_draft=eq.true&kitchen_status=eq.reserved`,
        { headers: s.headers }
      );
      const draftOrders: any[] = await draftRes.json();
      if (Array.isArray(draftOrders) && draftOrders.length > 0) {
        const draftIds = draftOrders.map(o => o.id).filter(Boolean);
        const CHUNK = 20;
        for (let i = 0; i < draftIds.length; i += CHUNK) {
          const chunk = draftIds.slice(i, i + CHUNK);
          const orFilter = chunk.map(id => `id.eq.${id}`).join(',');
          await fetch(`${s.url}/rest/v1/orders?or=(${orFilter})`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
          });
        }
      }
    }

    // 4. Handle guest arrival: if waiting or checked_in, activate table and clear reservation markers
    if ((status === 'waiting' || status === 'checked_in') && (current.status === 'confirmed' || current.status === 'waiting')) {
      if (current.table_ids) {
        const tableIds = typeof current.table_ids === 'string' ? JSON.parse(current.table_ids) : current.table_ids;
        for (const tId of tableIds) {
          await fetch(`${s.url}/rest/v1/table_floors?id=eq.${tId}`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify({
              status: status === 'waiting' ? 'waiting' : 'occupied',
              reservation_id: null,
              reservation_name: null,
              reservation_phone: null,
              reservation_time: null,
              guest_count: current.guests ?? null,
            }),
          });
        }
      }

      // Activate the linked draft order so the POS can open it and send to kitchen.
      const draftRes = await fetch(
        `${s.url}/rest/v1/orders?select=id&reservation_id=eq.${current.id}&is_draft=eq.true`,
        { headers: s.headers }
      );
      const draftOrders: any[] = draftRes.ok ? await draftRes.json() : [];
      if (Array.isArray(draftOrders) && draftOrders.length > 0) {
        const draftIds = draftOrders.map(o => o.id).join(',');
        await fetch(`${s.url}/rest/v1/orders?or=(${draftIds.split(',').map(id => `id.eq.${id}`).join(',')})`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({
            is_draft: false,
            kitchen_status: 'pending',
            status: 'confirmed',
            updated_at: new Date().toISOString(),
          }),
        });
        // Promote the draft's reserved kitchen items to pending too.
        await fetch(`${s.url}/rest/v1/order_items?or=(${draftIds.split(',').map(id => `order_id.eq.${id}`).join(',')})&kitchen_status=eq.reserved`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ kitchen_status: 'pending' }),
        });
      }
    }

    // 5. Sync table_floors based on target status
    if (current.table_ids) {
      const tableIds = typeof current.table_ids === 'string' ? JSON.parse(current.table_ids) : current.table_ids;
      const tableStatus = TABLE_STATUS_MAP[status];

      if (tableStatus !== undefined) {
        for (const tId of tableIds) {
          const patch: Record<string, any> = { status: tableStatus };
          if (tableStatus === 'empty') {
            patch.reservation_id = null;
            patch.reservation_name = null;
            patch.reservation_phone = null;
            patch.reservation_time = null;
            patch.guest_count = null;
          }
          await fetch(`${s.url}/rest/v1/table_floors?id=eq.${tId}`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify(patch),
          });
        }
      }
    }

    // 6. Update reservation
    const updatePayload: Record<string, any> = { status };
    if (notes) updatePayload.note = notes;
    if (status === 'checked_in') updatePayload.checked_in_at = new Date().toISOString();
    if (status === 'completed') updatePayload.completed_at = new Date().toISOString();

    await fetch(`${s.url}/rest/v1/reservations?id=eq.${reservationId}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify(updatePayload),
    });

    // 7. Audit log via canonical log_audit() RPC
    await fetch(`${s.url}/rest/v1/rpc/log_audit`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_action: 'status_change',
        p_entity_type: 'reservation',
        p_entity_id: reservationId,
        p_actor_id: auth.user?.id || null,
        p_actor_name: null,
        p_old_data: { status: current.status },
        p_new_data: { status, notes },
        p_metadata: { from: current.status, to: status },
      }),
    }).catch(() => {});

    // 8. If cancelled/no_show/expired with pre-order, cancel kitchen schedule
    if ((status === 'cancelled' || status === 'no_show' || status === 'expired') && current.kitchen_scheduled_at) {
      await fetch(`${s.url}/rest/v1/kitchen_schedule?reservation_id=eq.${reservationId}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({ status: 'cancelled' }),
      });
    }

    return NextResponse.json({ success: true, status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
