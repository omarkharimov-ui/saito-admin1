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

    const s = svc();

    // Check if source is a merged parent (has children)
    const childrenRes = await fetch(`${s.url}/rest/v1/table_floors?merged_into_table=eq.${from_table}&select=table_number`, { headers: s.headers });
    const children = await childrenRes.json();
    const childNumbers = (children || []).map((c: any) => c.table_number);
    const isMergedParent = childNumbers.length > 0;

    if (isMergedParent) {
      const unmergeRes = await fetch(`${s.url}/rest/v1/rpc/separate_tables_v1`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({
          p_primary_table: from_table,
          p_child_tables: childNumbers,
          p_performed_by: auth.user?.id || null,
        }),
      });

      if (!unmergeRes.ok) {
        const errText = await unmergeRes.text();
        return NextResponse.json({ error: `Unmerge failed: ${errText}` }, { status: 500 });
      }
    }

    // Now transfer the primary table
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/transfer_tables_v3`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_from_table: from_table,
        p_to_table: to_table,
        p_performed_by: auth.user?.id || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error('[Transfer Fatal]', errText);
      return NextResponse.json({ error: errText }, { status: 500 });
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

