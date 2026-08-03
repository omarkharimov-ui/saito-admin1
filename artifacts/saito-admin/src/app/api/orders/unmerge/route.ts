import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

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

    const shiftCheck = await requireActiveShift();
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error }, { status: 403 });
    }

    const { primary_table_number, child_table_numbers, terminal_id } = await req.json();
    if (!primary_table_number || !child_table_numbers?.length) {
      return NextResponse.json({ error: 'primary_table_number and child_table_numbers required' }, { status: 400 });
    }

    const s = svc();
    const childNums = child_table_numbers.map(Number);

    // Atomic unmerge RPC handles: unlink child orders, reset child tables, recalculate parent total
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/unmerge_tables_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_parent_table_number: primary_table_number,
        p_child_table_numbers: childNums,
        p_performed_by: auth.user?.id || null,
        p_performed_by_terminal_id: terminal_id || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return NextResponse.json({ error: errText }, { status: 400 });
    }

    const data = await rpcRes.json();

    if (!data?.success) {
      return NextResponse.json({ error: data?.error || 'Unmerge failed' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: { primaryTable: primary_table_number, childTables: childNums, ...data },
    });
  } catch (error: any) {
    console.error('[API /orders/unmerge] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
