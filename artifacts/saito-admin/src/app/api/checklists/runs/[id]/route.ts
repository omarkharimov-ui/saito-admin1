import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// Wave A #5 — run detail (any staff) + run actions (manager+).
// GET:  run + items (ordered) + assignee name — direct service read.
// PATCH: { action: 'assign', staff_id } | { action: 'skip', reason? } |
//        { action: 'unskip' } → checklist_assign_run / checklist_skip_run RPCs.
// SECURITY CHAIN (Rule 10): staff session → requireAuth → role gate →
// service_role → RPC / direct read.

const MANAGER_ROLES = ['admin', 'manager', 'superadmin', 'owner'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });

    const supabase = await createAuthClient();
    const { data, error } = await supabase
      .from('checklist_runs')
      .select('*, checklist_run_items(*), assigned_staff:staff!checklist_runs_assigned_to_fkey(name)')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      throw error;
    }
    data.checklist_run_items = (data.checklist_run_items || []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  if (!MANAGER_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    let rpc: string;
    let payload: Record<string, unknown>;
    if (body.action === 'assign') {
      const staffId = typeof body.staff_id === 'string' && UUID_RE.test(body.staff_id) ? body.staff_id : null;
      rpc = 'checklist_assign_run';
      payload = { p_run_id: id, p_staff_id: staffId, p_performed_by: auth.user?.id || null };
    } else if (body.action === 'skip' || body.action === 'unskip') {
      const reason = body.action === 'skip' && typeof body.reason === 'string' ? body.reason.slice(0, 300) : null;
      rpc = 'checklist_skip_run';
      payload = { p_run_id: id, p_reason: reason, p_performed_by: auth.user?.id || null };
    } else {
      return NextResponse.json({ error: "action must be 'assign' | 'skip' | 'unskip'" }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Run action failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
