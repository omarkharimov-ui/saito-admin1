import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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

    // Call atomic v3 RPC - SSOT for table grouping and order merging
    const { data, error } = await supabase.rpc('merge_tables_v3', {
      p_table_numbers: table_numbers,
      p_performed_by: auth.user?.id || null
    });

    if (error) {
      console.error('[Merge Fatal]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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


