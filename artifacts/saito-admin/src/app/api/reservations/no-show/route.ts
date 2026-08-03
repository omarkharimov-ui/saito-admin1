import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { reservation_id, terminal_id } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/rpc/mark_no_show_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_reservation_id: reservation_id,
        p_performed_by: auth.user?.id || null,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `No Show failed: ${errText}` }, { status: 400 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API /reservations/no-show] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
