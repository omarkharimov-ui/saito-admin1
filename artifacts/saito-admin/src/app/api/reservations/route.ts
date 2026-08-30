import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

async function logAudit(tableName: string, recordId: string, action: string, oldData: any, newData: any, userId?: string) {
  await fetch(`${svc().url}/rest/v1/rpc/log_audit`, {
    method: 'POST',
    headers: svc().headers,
    body: JSON.stringify({
      p_action: action,
      p_entity_type: tableName,
      p_entity_id: recordId,
      p_actor_id: userId || null,
      p_actor_name: null,
      p_old_data: oldData || null,
      p_new_data: newData || null,
    }),
  }).catch(() => {}); // Non-critical — don't fail the request if audit fails
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const [reservationsRes, ordersRes] = await Promise.all([
      fetch(`${svc().url}/rest/v1/reservations?select=*&order=date.desc,time.desc`, { headers: svc().headers }),
      fetch(`${svc().url}/rest/v1/orders?select=table_number,status&or=(status.eq.new,status.eq.confirmed,status.eq.paid)`, { headers: svc().headers }),
    ]);

    const reservations = await reservationsRes.json();
    const orders = await ordersRes.json();

    const phoneVisits: Record<string, number> = {};
    (reservations || []).forEach((r: any) => {
      if (r.phone) {
        phoneVisits[r.phone] = (phoneVisits[r.phone] || 0) + 1;
      }
    });

    const enhancedReservations = (reservations || []).map((r: any) => ({
      ...r,
      visitCount: phoneVisits[r.phone] || 1
    }));

    return NextResponse.json({
      reservations: enhancedReservations,
      orders: orders || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { action, data, id } = body;

    if (action === 'create' || (action === 'update' && (data?.date || data?.time || data?.table_ids))) {
      const date = data?.date || body.date;
      const time = data?.time || body.time;
      const table_ids = data?.table_ids || body.table_ids;

      if (date && time && table_ids) {
        // Check for overlapping reservations on the same tables
        // Simple check: same date, same time range (+/- 2 hours)
        const checkUrl = `${svc().url}/rest/v1/reservations?select=id,name,time&date=eq.${date}&status=eq.confirmed`;
        const checkRes = await fetch(checkUrl, { headers: svc().headers });
        const existing = await checkRes.json();

        const requestedTime = new Date(`1970-01-01T${time}:00`).getTime();
        const buffer = 2 * 60 * 60 * 1000; // 2 hours

        const conflict = existing.find((res: any) => {
          if (id && res.id === id) return false; // ignore self
          
          const resTime = new Date(`1970-01-01T${res.time}:00`).getTime();
          const isOverlapping = Math.abs(requestedTime - resTime) < buffer;
          
          // Check if any table overlaps
          const existingTables = typeof res.table_ids === 'string' ? JSON.parse(res.table_ids) : (res.table_ids || []);
          const requestedTables = typeof table_ids === 'string' ? JSON.parse(table_ids) : table_ids;
          
          const hasTableConflict = requestedTables.some((tId: string) => existingTables.includes(tId));
          
          return isOverlapping && hasTableConflict;
        });

        if (conflict) {
          return NextResponse.json({ 
            error: `Conflict: Table is already reserved by ${conflict.name} at ${conflict.time}` 
          }, { status: 409 });
        }
      }
    }

    let url = `${svc().url}/rest/v1/reservations`;
    let method = 'POST';
    let payload = data || body;
    
    if (action === 'update') {
      url += `?id=eq.${id}`;
      method = 'PATCH';
    } else if (action === 'delete') {
      url += `?id=eq.${id}`;
      method = 'DELETE';
      payload = undefined;
    } else if (action === 'delete_batch') {
      const ids = body.ids;
      const statuses = body.statuses;
      if (!ids && !statuses) {
        return NextResponse.json({ error: 'ids or statuses required for batch delete' }, { status: 400 });
      }
      let deleteUrl = `${svc().url}/rest/v1/reservations`;
      if (ids?.length) {
        const quoted = ids.map((x: string) => `"${x}"`).join(',');
        deleteUrl += `?id=in.(${quoted})`;
      } else if (statuses?.length) {
        const quoted = statuses.map((s: string) => `status.eq.${s}`).join(',');
        deleteUrl += `?or=(${quoted})`;
      }
      const delRes = await fetch(deleteUrl, { method: 'DELETE', headers: svc().headers });
      if (!delRes.ok) {
        const err = await delRes.text();
        return NextResponse.json({ error: err }, { status: delRes.status });
      }
      const performedBy = auth.user?.id || null;
      if (ids?.length) {
        for (const rid of ids) logAudit('reservations', rid, 'delete', null, null, performedBy);
      }
      return NextResponse.json({ success: true, deleted: true });
    } else if (action === 'archive') {
      url += `?id=eq.${id}`;
      method = 'PATCH';
      payload = { status: 'archived' };
    } else if (action === 'restore') {
      url += `?id=eq.${id}`;
      method = 'PATCH';
      payload = { status: 'pending' };
    }

    const res = await fetch(url, {
      method,
      headers: { ...svc().headers, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const result = method === 'DELETE' ? { success: true } : await res.json();

    // Audit log (non-blocking)
    const performedBy = auth.user?.id || null;
    if (action === 'create') {
      const newId = result?.[0]?.id || result?.id;
      if (newId) logAudit('reservations', newId, 'create', null, result, performedBy);
    } else if (action === 'update') {
      logAudit('reservations', id, 'update', null, payload, performedBy);
    } else if (action === 'delete') {
      logAudit('reservations', id, 'delete', null, null, performedBy);
    } else if (action === 'archive') {
      logAudit('reservations', id, 'archive', null, { status: 'archived' }, performedBy);
    } else if (action === 'restore') {
      logAudit('reservations', id, 'restore', null, { status: 'pending' }, performedBy);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
