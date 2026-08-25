import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { table_number, guest_count } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const s = svc();
    const guests = Math.max(1, Math.min(99, Number(guest_count) || 1));

    const tablesRes = await fetch(`${s.url}/rest/v1/table_floors?select=id,status,reservation_id&table_number=eq.${table_number}`, { headers: s.headers });
    const tables = await tablesRes.json();
    if (!tables || tables.length === 0) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }
    if (tables.some((t: any) => t.status === 'reserved')) {
      return NextResponse.json({ error: 'Table is reserved' }, { status: 409 });
    }

    const patchRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'occupied',
        guest_count: guests,
        last_activity_at: new Date().toISOString(),
      }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error('[Seat Fatal]', errText);
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    return NextResponse.json({ success: true, table_number, guest_count: guests });
  } catch (error: any) {
    console.error('[API /tables/seat] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
