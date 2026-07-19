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

    return NextResponse.json({ 
      success: true, 
      data: { 
        ...data,
        undo: { 
          sourceTableNumbers: table_numbers.slice(1),
          targetTable: table_numbers[0],
          sourceOrders: sourceOrdersSnapshot
        }
      } 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


