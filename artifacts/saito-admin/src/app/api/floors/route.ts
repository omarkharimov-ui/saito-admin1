import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13d: service-role table_floors read.
// ROOT CAUSE (audit 13d-A): POS TableStatusGrid + the kitchen map view read
// `table_floors` directly from the browser (no policy for user sessions —
// only service_full + loc-gated SELECT) → floor assignments / table lists
// were always empty.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const res = await fetch(
      `${url}/rest/v1/table_floors?select=id,table_number,floor_name,status,bill_requested,sort_order&order=sort_order.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to load floors' }, { status: 502 });
    return NextResponse.json(await res.json());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
