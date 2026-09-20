import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

// pr v1 — print device patch / delete (settings.admin only).
// PATCH body: any of { name, doc_types, iface, host, port, paper_width, copies, enabled }
// DELETE: blocked while the device has queued/claimed jobs.
// SECURITY CHAIN (Rule 10): staff session → requirePermission('settings.admin')
// → CSRF → service_role → print_device_patch/delete() RPC.

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePermission('settings.admin');
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(request, true)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const res = await fetch(`${url}/rest/v1/rpc/print_device_patch`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: id, p_patch: body, p_staff_id: auth.user?.id || null }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Device update failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePermission('settings.admin');
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(request, true)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const res = await fetch(`${url}/rest/v1/rpc/print_device_delete`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: id, p_staff_id: auth.user?.id || null }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Device delete failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
