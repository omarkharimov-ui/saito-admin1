import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { requireActiveShift } from '@/lib/shiftLock';
import { verifyManagerPin } from '@/lib/managerPin';

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

    const body = await req.json().catch(() => ({}));
    const { table_number, terminal_id, manager_pin, reason } = body as {
      table_number?: number; terminal_id?: string | null; manager_pin?: string | null; reason?: string | null;
    };
    if (!table_number) {
      return NextResponse.json({ error: 'Table number required' }, { status: 400 });
    }

    // QF3 (RED #1-2): clearing a table is a destructive manager operation —
    // ALWAYS requires a verified manager PIN (safety gate), and the verified
    // PIN doubles as the shift-lock override (payment works with a closed
    // shift, so table release must too — no more stuck tables).
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const pinCheck = await verifyManagerPin(String(manager_pin || ''), ip);
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error, pin_required: true }, { status: 403 });
    }

    const s = svc();

    // Shift lock: PIN-verified manager override.
    const shiftCheck = await requireActiveShift(true);
    if (!shiftCheck.ok) {
      return NextResponse.json({ error: shiftCheck.error, pin_required: true }, { status: 403 });
    }

    // Audit: who cleared which table, with what reason, shift-open or override.
    try {
      await fetch(`${s.url}/rest/v1/rpc/log_audit`, {
        method: 'POST',
        headers: s.headers,
        body: JSON.stringify({
          p_action: 'clear_table',
          p_entity_type: 'table',
          p_entity_id: String(table_number),
          p_actor_id: pinCheck.staffId || null,
          p_actor_name: pinCheck.name || null,
          p_old_data: null,
          p_new_data: null,
          p_metadata: { pin_verified: true, pin_role: pinCheck.role, reason: reason || null, terminal_id: terminal_id || null },
        }),
      });
    } catch { /* non-critical */ }

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
