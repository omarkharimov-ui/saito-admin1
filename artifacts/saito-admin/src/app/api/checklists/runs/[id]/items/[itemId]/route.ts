import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// Wave A #5 — checklist item toggle (ANY authenticated staff — floor staff
// complete their day's items).
// Body: { completed: boolean, note?: string }
// Atomic inside the RPC: item flip + run status recompute
// (pending → in_progress → completed) + audit.
// SECURITY CHAIN (Rule 10): staff session → requireAuth → service_role →
// checklist_toggle_item() RPC.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const { id, itemId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(itemId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    if (typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'completed (boolean) required' }, { status: 400 });
    }
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const res = await fetch(`${url}/rest/v1/rpc/checklist_toggle_item`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_item_id: itemId,
        p_completed: body.completed,
        p_note: note,
        p_staff_id: auth.user?.id || null,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Item toggle failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
