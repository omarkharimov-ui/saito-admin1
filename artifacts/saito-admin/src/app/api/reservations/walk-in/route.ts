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
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const { table_number, guests, name, phone, order_type, notes } = await request.json();
    if (!table_number) {
      return NextResponse.json({ error: 'table_number is required' }, { status: 400 });
    }

    const s = svc();

    // Atomic walk-in: reservation + customer + order + table update + audit
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/walkin_atomic`, {
      method: 'POST',
      headers: s.headers,
        body: JSON.stringify({
          p_table_number: table_number,
          p_guests: guests || 1,
          p_name: name || null,
          p_phone: phone || null,
          p_order_type: order_type || 'dine_in',
          p_notes: notes || null,
          p_user_id: auth.user?.id || null,
        }),
    });

    const rpcData = await rpcRes.json();
    if (!rpcRes.ok || rpcData?.error) {
      if (rpcData?.error?.includes?.('TABLE_NOT_FOUND')) {
        return NextResponse.json({ error: 'Table not found' }, { status: 404 });
      }
      if (rpcData?.error?.includes?.('TABLE_NOT_EMPTY')) {
        return NextResponse.json({ error: 'Table is not empty' }, { status: 409 });
      }
      return NextResponse.json({ error: rpcData?.error || 'Walk-in failed' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      ...rpcData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
