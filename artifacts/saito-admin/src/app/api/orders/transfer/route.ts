import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

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

    const { from_table, to_table } = await request.json();
    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const rpcRes = await fetch(`${svc().url}/rest/v1/rpc/transfer_tables_v3`, {
      method: 'POST',
      headers: svc().headers,
      body: JSON.stringify({
        p_from_table: from_table,
        p_to_table: to_table,
        p_performed_by: auth.user?.id || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error('[Transfer Fatal]', errText);
      const msg = errText.includes('TARGET_TABLE_NOT_EMPTY') || errText.includes('NO_ACTIVE_ORDERS') ? errText : errText;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const data = await rpcRes.json();

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        undo: { fromTable: from_table, toTable: to_table, orderIds: data?.order_ids || [] }
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

