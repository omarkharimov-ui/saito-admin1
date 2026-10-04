import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// 13d: service-role lookup for ManualOrderModal — "is there already an active
// order on this table?" ROOT CAUSE (audit 13d-A): the modal queried `orders`
// directly from the browser (RLS `orders_select_loc` → empty) → it never saw
// the active order and always created a NEW one instead of adding items to
// the existing order.
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('pos.use');
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const tableNumber = Number(new URL(request.url).searchParams.get('table_number'));
    if (!Number.isFinite(tableNumber)) return NextResponse.json({ error: 'table_number is required' }, { status: 400 });

    const res = await fetch(
      `${url}/rest/v1/orders?select=id,total_amount&table_number=eq.${tableNumber}&status=in.(new,confirmed)&order=created_at.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to load active order' }, { status: 502 });
    const rows: any[] = await res.json();
    return NextResponse.json({ order: rows[0] || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
