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
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { table_numbers } = await request.json();
    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'Ən azı 2 masa seçilməlidir' }, { status: 400 });
    }

    const s = svc();

    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/merge_tables_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_parent_table_number: Number(table_numbers[0]),
        p_child_table_numbers: table_numbers.slice(1).map(Number),
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: null,
      }),
    });

    const rpcData = await rpcRes.json();
    if (!rpcRes.ok || !rpcData?.success) {
      const message = rpcData?.error || 'Merge failed';
      console.error('[API /orders/merge] RPC error:', message);
      return NextResponse.json({ error: message }, { status: rpcRes.ok ? 400 : rpcRes.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...rpcData,
        undo: {
          sourceTableNumbers: table_numbers.slice(1),
          targetTable: table_numbers[0],
        },
      },
    });
  } catch (error: any) {
    console.error('[API /orders/merge] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


