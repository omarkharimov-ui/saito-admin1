import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// Wave A #5 — checklist templates.
// GET: list (manager+). POST: upsert (manager+) via checklist_upsert_template
// RPC (validation + normalization + audit inside the RPC).
// SECURITY CHAIN (Rule 10): staff session → requireAuth → role gate →
// service_role → RPC / direct read.

const MANAGER_ROLES = ['admin', 'manager', 'superadmin', 'owner'];

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  if (!MANAGER_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const supabase = await createAuthClient();
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('*')
      .order('category', { ascending: true })
      .order('title', { ascending: true });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

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

    const res = await fetch(`${url}/rest/v1/rpc/checklist_upsert_template`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_id: body.id || null,
        p_title: body.title,
        p_category: body.category,
        p_items: body.items,
        p_scheduled_at: body.scheduled_at || null,
        p_recurring: body.recurring || 'manual',
        p_is_active: body.is_active === undefined ? true : !!body.is_active,
        p_staff_id: auth.user?.id || null,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Template operation failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
