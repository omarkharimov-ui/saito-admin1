import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    // F-01 (frozen): clear is a manager-level floor op (`floor.manage`).
    // F-02 (frozen): p_token = session identity; the RPC enforces permission +
    // location isolation server-side.
    const auth = await requirePermission('floor.manage');
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
    const res = await fetch(`${s.url}/rest/v1/rpc/clear_table_atomic`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        p_token: auth.token,
        p_table_number: table_number,
        p_performed_by: auth.user?.id || null,
        p_terminal_id: terminal_id || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      const message = data?.error || data?.message || 'Table clear failed';
      console.error('[API /orders/clear-table] RPC error:', message);
      const status = data?.error === 'PERMISSION_DENIED' || data?.error === 'FORBIDDEN_LOCATION' ? 403
        : data?.error === 'FORBIDDEN' ? 401 : res.ok ? 500 : res.status;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /orders/clear-table] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
