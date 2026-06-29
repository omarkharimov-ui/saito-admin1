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
    const auth = await requireAuth(['admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const now = new Date().toISOString();

    // Find reserved tables whose kitchen_scheduled_at has passed
    const res = await fetch(
      `${s.url}/rest/v1/table_floors?select=*&status=eq.reserved&kitchen_scheduled_at=lte.${now}`,
      { headers: s.headers }
    );
    const tables = await res.json();

    const results = [];
    for (const table of tables || []) {
      if (!table.reservation_id) continue;

      // Check if draft order already exists
      const existingOrder = await fetch(
        `${s.url}/rest/v1/orders?select=id&table_number=eq.${table.table_number}&is_draft=eq.true&kitchen_status=eq.reserved`,
        { headers: s.headers }
      );
      const orders = await existingOrder.json();
      const draft = Array.isArray(orders) ? orders[0] : null;

      if (draft) {
        // Flip draft to live
        await fetch(`${s.url}/rest/v1/orders?id=eq.${draft.id}`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ is_draft: false, kitchen_status: 'pending' }),
        });
        results.push({ table: table.table_number, action: 'activated', orderId: draft.id });
      }
    }

    return NextResponse.json({ success: true, activated: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const now = new Date().toISOString();

    const res = await fetch(
      `${s.url}/rest/v1/table_floors?select=table_number,reservation_id,kitchen_scheduled_at&status=eq.reserved&kitchen_scheduled_at=lte.${now}`,
      { headers: s.headers }
    );
    const tables = await res.json();

    return NextResponse.json({ pending: tables || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
