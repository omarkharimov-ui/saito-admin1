import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_id, guest_count } = await req.json();
    if (!table_id) return NextResponse.json({ error: 'Table ID required' }, { status: 400 });

    const s = svc();

    const tableRes = await fetch(`${s.url}/rest/v1/table_floors?select=*&id=eq.${table_id}`, { headers: s.headers });
    if (!tableRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch table' }, { status: 500 });
    }
    const tables: any[] = await tableRes.json();
    const currentTable = tables?.[0];

    if (!currentTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    if (currentTable.status !== 'reserved') {
      return NextResponse.json({ error: 'Table is not reserved' }, { status: 409 });
    }

    const reservationRes = await fetch(`${s.url}/rest/v1/reservations?id=eq.${currentTable.reservation_id}`, { headers: s.headers });
    if (!reservationRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch reservation' }, { status: 500 });
    }
    const reservations: any[] = await reservationRes.json();
    const reservation = reservations?.[0];

    const tablePatch: Record<string, any> = {
      status: 'occupied',
      reservation_id: null,
      reservation_name: null,
      reservation_phone: null,
      reservation_time: null,
      guest_count: guest_count ?? reservation?.guests ?? null,
    };

    const updatedTableRes = await fetch(`${s.url}/rest/v1/table_floors?id=eq.${table_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify(tablePatch),
    });
    if (!updatedTableRes.ok) {
      return NextResponse.json({ error: 'Failed to update table' }, { status: 500 });
    }

    const updatedTables = await updatedTableRes.json();
    const updatedTable = Array.isArray(updatedTables) ? updatedTables[0] : updatedTables;

    if (reservation) {
      await fetch(`${s.url}/rest/v1/reservations?id=eq.${reservation.id}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, table: updatedTable });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
