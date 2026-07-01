import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['checked_in', 'cancelled', 'no_show', 'expired'],
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

    const { id, status, notes } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const s = svc();

    // 1. Fetch current reservation
    const resRes = await fetch(`${s.url}/rest/v1/reservations?select=*&id=eq.${id}`, { headers: s.headers });
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
        // Cancel the active orders too
        for (const order of activeOrders) {
          await fetch(`${s.url}/rest/v1/orders?id=eq.${order.id}`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
          });
        }
      }
    }

    // 4. Handle check-in: if checked_in, try to activate table (idempotent)
    if (status === 'checked_in' && current.status === 'confirmed') {
      if (current.table_ids) {
        const tableIds = typeof current.table_ids === 'string' ? JSON.parse(current.table_ids) : current.table_ids;
        for (const tId of tableIds) {
          await fetch(`${s.url}/rest/v1/table_floors?id=eq.${tId}`, {
            method: 'PATCH',
            headers: s.headers,
            body: JSON.stringify({
              status: 'occupied',
              reservation_id: null,
              reservation_name: null,
              reservation_phone: null,
              reservation_time: null,
              guest_count: current.guests ?? null,
            }),
          });
        }
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

    await fetch(`${s.url}/rest/v1/reservations?id=eq.${id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify(updatePayload),
    });

    // 7. Audit log
    const auditTable = 'audit_logs';
    const auditBody = {
      table_name: 'reservations',
      record_id: id,
      action: `status_change:${current.status}→${status}`,
      old_data: { status: current.status },
      new_data: { status, notes },
      performed_by: auth.user?.id || null,
      created_at: new Date().toISOString(),
    };
    const auditRes = await fetch(`${s.url}/rest/v1/${auditTable}`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify(auditBody),
    });
    if (!auditRes.ok) {
      const auditText = await auditRes.text();
      // Try with singular name if plural fails
      if (auditRes.status === 404) {
        await fetch(`${s.url}/rest/v1/audit_log`, {
          method: 'POST',
          headers: s.headers,
          body: JSON.stringify(auditBody),
        });
      }
    }

    // 8. If cancelled/no_show/expired with pre-order, cancel kitchen schedule
    if ((status === 'cancelled' || status === 'no_show' || status === 'expired') && current.kitchen_scheduled_at) {
      await fetch(`${s.url}/rest/v1/kitchen_schedule?reservation_id=eq.${id}`, {
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
