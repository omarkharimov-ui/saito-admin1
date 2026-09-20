import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// Wave A #5 — manual checklist run creation (manager+).
// Body: { title, category, items: [{title, note?}], assigned_to?, due_at?, run_date? }
// SECURITY CHAIN (Rule 10): staff session → requireAuth → role gate →
// service_role → checklist_create_run() RPC (validation + audit inside).

const MANAGER_ROLES = ['admin', 'manager', 'superadmin', 'owner'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  if (!MANAGER_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const runDate = body.run_date && DATE_RE.test(body.run_date) ? body.run_date : null;
    const dueAt = typeof body.due_at === 'string' && body.due_at ? body.due_at : null;

    const res = await fetch(`${url}/rest/v1/rpc/checklist_create_run`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_title: body.title,
        p_category: body.category,
        p_items: body.items,
        p_assigned_to: body.assigned_to || null,
        p_run_date: runDate,
        p_due_at: dueAt,
        p_staff_id: auth.user?.id || null,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Run creation failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
