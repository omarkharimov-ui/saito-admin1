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

    const primaryHasOrderRes = await fetch(`${s.url}/rest/v1/orders?table_number=eq.${primary_table_number}&status=not.in.(paid,cancelled,closed)&select=id`, { headers: s.headers });
    const primaryOrders = await primaryHasOrderRes.json();
    const primaryHasOrder = (primaryOrders || []).length > 0;

    const childTableNumbers = child_table_numbers.map((n: any) => Number(n));
    const childWhere = `table_number=in.(${childTableNumbers.join(',')})`;

    await fetch(`${s.url}/rest/v1/table_floors?${childWhere}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({
        status: 'empty',
        guest_count: null,
        total_amount: 0,
        merged_into_table: null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!primaryHasOrder) {
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${primary_table_number}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          status: 'empty',
          guest_count: null,
          total_amount: 0,
          merged_into_table: null,
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      await fetch(`${s.url}/rest/v1/table_floors?table_number=eq.${primary_table_number}`, {
        method: 'PATCH',
        headers: s.headers,
        body: JSON.stringify({
          merged_into_table: null,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    return NextResponse.json({
      success: true,
      data: { primaryTable: primary_table_number, childTables: childTableNumbers },
      undo: { primaryTable: primary_table_number, childTables: childTableNumbers },
    });
  } catch (error: any) {
    console.error('[API /orders/unmerge] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
