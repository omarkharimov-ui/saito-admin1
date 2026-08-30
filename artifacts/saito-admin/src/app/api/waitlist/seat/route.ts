import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const { waitlist_id, table_number } = await request.json();
    if (!waitlist_id || !table_number) {
      return NextResponse.json({ error: 'waitlist_id and table_number are required' }, { status: 400 });
    }

    const s = svc();

    const waitlistRes = await fetch(`${s.url}/rest/v1/waitlist?id=eq.${waitlist_id}&select=*`, { headers: s.headers });
    const waitlistData = await waitlistRes.json();
    const entry = Array.isArray(waitlistData) ? waitlistData[0] : null;

    if (!entry) {
      return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
    }

    const tableRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}&select=*`, { headers: s.headers });
    const tables = await tableRes.json();
    const table = Array.isArray(tables) ? tables[0] : null;

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    if (table.status !== 'empty') {
      return NextResponse.json({ error: 'Table is not empty' }, { status: 409 });
    }

    await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'occupied',
        guest_count: entry.guests || 1,
        reservation_name: entry.name,
        reservation_phone: entry.phone,
        last_activity_at: new Date().toISOString(),
      }),
    });

    await fetch(`${s.url}/rest/v1/waitlist?id=eq.${waitlist_id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'seated',
        seated_at: new Date().toISOString(),
      }),
    });

    return NextResponse.json({ success: true, table_number });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
