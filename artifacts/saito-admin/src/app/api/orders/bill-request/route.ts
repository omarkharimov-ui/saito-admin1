import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const body = await request.json();
    const { table_number, bill_requested } = body;
    if (!table_number || !['number', 'boolean'].includes(typeof table_number)) {
      return NextResponse.json({ error: 'table_number is required' }, { status: 400 });
    }
    if (typeof bill_requested !== 'boolean') {
      return NextResponse.json({ error: 'bill_requested must be boolean' }, { status: 400 });
    }

    const s = svc();
    const now = new Date().toISOString();

    const tableRes = await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${table_number}&select=id,status,order_count`, {
      headers: s.headers,
    });
    const tables = await tableRes.json();
    const table = Array.isArray(tables) ? tables[0] : null;
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    await fetch(`${s.url}/rest/v1/table_floors?id=eq.${table.id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        bill_requested,
        updated_at: now,
        ...(bill_requested ? { status: 'payment_pending' } : {}),
      }),
    });

    return NextResponse.json({ success: true, table_number, bill_requested: bill_requested });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
