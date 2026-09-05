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
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { primary_table_number, child_table_numbers } = await req.json();
    if (!primary_table_number || !child_table_numbers?.length) {
      return NextResponse.json({ error: 'primary_table_number and child_table_numbers required' }, { status: 400 });
    }

    const s = svc();
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/unmerge_tables_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_parent_table_number: Number(primary_table_number),
        p_child_table_numbers: child_table_numbers.map(Number),
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: null,
      }),
    });

    const rpcData = await rpcRes.json();
    if (!rpcRes.ok || !rpcData?.success) {
      const message = rpcData?.error || 'Unmerge failed';
      console.error('[API /orders/unmerge] RPC error:', message);
      return NextResponse.json({ error: message }, { status: rpcRes.ok ? 400 : rpcRes.status });
    }

    return NextResponse.json({
      success: true,
      data: { primaryTable: primary_table_number, childTables: child_table_numbers },
      undo: { primaryTable: primary_table_number, childTables: child_table_numbers },
    });
  } catch (error: any) {
    console.error('[API /orders/unmerge] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
