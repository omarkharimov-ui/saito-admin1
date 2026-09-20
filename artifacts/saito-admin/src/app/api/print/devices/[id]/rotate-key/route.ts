import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

// pr v1 — rotate a device's LAN agent key (settings.admin only).
// The new agent_key is returned ONCE in this response; the operator must
// reconfigure the print agent. Audited (print_device_rotate_key).
// SECURITY CHAIN (Rule 10): staff session → requirePermission('settings.admin')
// → CSRF → service_role → print_device_rotate_key() RPC.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const res = await fetch(`${url}/rest/v1/rpc/print_device_rotate_key`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: id, p_staff_id: auth.user?.id || null }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Key rotation failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
