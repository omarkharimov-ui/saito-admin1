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

    const { table_number, terminal_id } = await req.json();
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    const s = svc();

    // 1. Find child tables merged into this table
    const childrenRes = await fetch(
      `${s.url}/rest/v1/table_floors?merged_into_table=eq.${table_number}&select=table_number`,
      { headers: s.headers }
    );
    const children = await childrenRes.json();
    const childNumbers = Array.isArray(children) ? children.map((c: any) => c.table_number) : [];

    // 2. Use atomic RPC for each table (parent + children) with final_status = 'dirty'
    const allTables = [table_number, ...childNumbers];
    const rpcResults = await Promise.all(
      allTables.map(num =>
        fetch(`${s.url}/rest/v1/rpc/dismiss_table_atomic`, {
          method: 'POST',
          headers: s.headers,
          body: JSON.stringify({
            p_table_number: num,
            p_reason: 'dismissed',
            p_final_status: 'empty',
            p_performed_by: auth.user?.id || null,
            p_terminal_id: terminal_id || null,
          }),
        })
      )
    );

    const failedTables: number[] = [];
    for (let i = 0; i < rpcResults.length; i++) {
      const rpcRes = rpcResults[i];
      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        console.error('[Dismiss RPC]', errText);
        failedTables.push(allTables[i]);
      }
    }

    if (failedTables.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `Failed to dismiss tables: ${failedTables.join(', ')}` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, dismissedTables: allTables });
  } catch (error: any) {
    console.error('[API /orders/dismiss] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
