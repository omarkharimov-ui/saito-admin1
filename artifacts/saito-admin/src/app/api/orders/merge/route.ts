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

    const { table_numbers , terminal_id } = await request.json();
    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'Ən azı 2 masa seçilməlidir' }, { status: 400 });
    }

    const s = svc();

    // Atomic merge RPC handles: order merge, table_floors update, kitchen_schedule move, reservation table_ids update
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/merge_tables_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_parent_table_number: table_numbers[0],
        p_child_table_numbers: table_numbers.slice(1),
        p_performed_by: auth.user?.id || null
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error('[Merge Fatal]', errText);
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    const data = await rpcRes.json();

    if (!data?.success) {
      return NextResponse.json({ error: data?.error || 'Merge failed' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      data 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
