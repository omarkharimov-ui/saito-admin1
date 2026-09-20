import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { resolveWriteLocationContext } from '@/lib/location-context';

// pr v1 — print device registry (settings.admin only).
// GET → device list for the operator's location (D-5: location is
// SERVER-DERIVED from the session/staff binding — never client-supplied)
// POST → upsert { name, doc_types?, iface?, host?, port?, paper_width?,
//                 copies?, enabled? }
// agent_key is returned ONCE for NEW devices (LAN agent configuration);
// existing devices keep their key — rotate via /api/print/devices/[id]/rotate-key.
// SECURITY CHAIN (Rule 10): staff session → requirePermission('settings.admin')
// → resolveWriteLocationContext (D-5) → CSRF (mutating) → service_role →
// print_device_*() RPCs.

const DOC_TYPES = ['receipt', 'kitchen', 'label'];
const IFACES = ['browser', 'escpos_network'];

async function rpc(url: string, key: string, fn: string, args: unknown) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${fn} failed: ${t}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function resolveLocation(auth: any) {
  const ctx = await resolveWriteLocationContext(auth.user!.id);
  return ctx?.locationId || '';
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission('settings.admin');
  if (!auth.authenticated) return auth;
  try {
    const locationId = await resolveLocation(auth);
    if (!locationId) return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    // print_device_list returns a JSONB ARRAY directly (not {success} wrapper)
    const res = await fetch(`${url}/rest/v1/rpc/print_device_list`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_location_id: locationId }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Device list failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json({ devices: Array.isArray(data) ? data : [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const locationId = await resolveLocation(auth);
    if (!locationId) return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });

    const docTypes = Array.isArray(body.doc_types)
      ? body.doc_types.filter((d: string) => DOC_TYPES.includes(d))
      : ['receipt'];
    const iface = typeof body.iface === 'string' && IFACES.includes(body.iface) ? body.iface : 'browser';
    if (!body.name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }
    if (Number.isInteger(body.port) && (body.port < 1 || body.port > 65535)) {
      return NextResponse.json({ error: 'port must be 1-65535' }, { status: 400 });
    }

    const row = await rpc(url, key, 'print_device_upsert', {
      p_location_id: locationId,
      p_name: body.name,
      p_doc_types: docTypes,
      p_iface: iface,
      p_host: typeof body.host === 'string' && body.host.trim() ? body.host.trim() : null,
      p_port: Number.isInteger(body.port) ? body.port : null,
      p_paper_width: body.paper_width === '58mm' || body.paper_width === '80mm' ? body.paper_width : null,
      p_copies: Number.isInteger(body.copies) ? body.copies : null,
      p_enabled: typeof body.enabled === 'boolean' ? body.enabled : null,
      p_staff_id: auth.user?.id || null,
    });
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
