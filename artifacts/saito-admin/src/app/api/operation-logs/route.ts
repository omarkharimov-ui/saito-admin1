import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const body = await request.json();
    const { table_number, order_id, reservation_id, action, old_values, new_values, performed_by } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        table_number,
        order_id,
        reservation_id,
        action,
        old_values: old_values || null,
        new_values: new_values || null,
        performed_by: performed_by || null,
        created_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: errText }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);
    const table_number = searchParams.get('table_number');
    const order_id = searchParams.get('order_id');
    const action = searchParams.get('action');
    const limit = parseInt(searchParams.get('limit') || '50');

    const filters: string[] = [];
    if (table_number) filters.push(`table_number=eq.${table_number}`);
    if (order_id) filters.push(`order_id=eq.${order_id}`);
    if (action) filters.push(`action=eq.${action}`);

    const query = `${svc().url}/rest/v1/operation_logs?${filters.join('&')}&order=created_at.desc&limit=${limit}`;
    const res = await fetch(query, { headers: svc().headers });
    const data = await res.json();

    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
