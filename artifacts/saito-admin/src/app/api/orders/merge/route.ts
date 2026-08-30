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

    // Capture source order snapshots BEFORE merge for reliable undo
    const sourceOrdersSnapshot: any[] = [];
    for (const tn of table_numbers.slice(1)) {
      const srcRes = await fetch(`${svc().url}/rest/v1/orders?select=*&table_number=eq.${tn}&status=neq.paid&status=neq.cancelled&order=created_at.asc`, { headers: svc().headers });
      const srcData = await srcRes.json();
      if (Array.isArray(srcData)) sourceOrdersSnapshot.push(...srcData);
    }

    // Capture pre-merge table_floors state (status, guests, totals) for undo
    const tableStateSnapshot: any[] = [];
    for (const tn of table_numbers) {
      const tRes = await fetch(`${svc().url}/rest/v1/table_floors?table_number=eq.${tn}&select=*`, { headers: svc().headers });
      const tData = await tRes.json();
      if (Array.isArray(tData) && tData[0]) tableStateSnapshot.push(tData[0]);
    }

    // Did the target table already have an active order before merge?
    const parentPreRes = await fetch(`${svc().url}/rest/v1/orders?table_number=eq.${table_numbers[0]}&status=neq.paid&status=neq.cancelled&status=neq.closed&select=id`, { headers: svc().headers });
    const parentPreOrders = await parentPreRes.json();
    const parentHadActiveOrder = Array.isArray(parentPreOrders) && parentPreOrders.length > 0;

    // Atomic merge RPC (exists in DB as saito_merge_tables)
    const rpcRes = await fetch(`${svc().url}/rest/v1/rpc/saito_merge_tables`, {
      method: 'POST',
      headers: svc().headers,
      body: JSON.stringify({
        p_table_numbers: table_numbers,
        p_performed_by: auth.user?.id || null
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error('[Merge Fatal]', errText);
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    const data = await rpcRes.json();

    // Move kitchen_schedule references from child tables to the merged parent
    // so the KDS shows the correct (merged) table number after a merge.
    const targetTable = table_numbers[0];
    const sourceTables = table_numbers.slice(1);
    if (sourceTables.length) {
      const scheduleTables = sourceTables.join(',');
      await fetch(`${svc().url}/rest/v1/kitchen_schedule?table_number=in.(${scheduleTables})`, {
        method: 'PATCH',
        headers: svc().headers,
        body: JSON.stringify({ table_number: targetTable }),
      }).catch(() => {});
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        ...data,
        undo: { 
          sourceTableNumbers: table_numbers.slice(1),
          targetTable: table_numbers[0],
          sourceOrders: sourceOrdersSnapshot,
          tableState: tableStateSnapshot,
          parentHadActiveOrder
        }
      } 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


