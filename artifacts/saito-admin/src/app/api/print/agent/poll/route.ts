import { NextRequest, NextResponse } from 'next/server';

// pr v1 — LAN print agent entry point (headless; NO staff session).
// Body: { device_key, max? }
// device_key is the 48-hex secret shown ONCE at device creation (or after
// rotation) — it is the credential for this endpoint. The agent heartbeats
// (last_seen/online), receives only ITS device's queued jobs (claimed as
// agent:<name>), and reports results back through print_result(from_agent).
// SECURITY CHAIN: device_key → service_role → print_agent_poll() RPC.
// Note: an agent result for its own claimed jobs also goes through
// POST /api/print/result with from_agent semantics via print_result RPC
// (exposed here too, see below).

async function rpc(url: string, key: string, fn: string, args: unknown) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const t = await res.text();
    return { row: { success: false, error: `${fn} failed: ${t}` } };
  }
  const data = await res.json();
  return { row: Array.isArray(data) ? data[0] : data };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    // ── result reporting (same endpoint, action field) ─────────────────────
    if (body.action === 'result') {
      if (!body.job_id || typeof body.success !== 'boolean') {
        return NextResponse.json({ error: 'job_id and success (boolean) required' }, { status: 400 });
      }
      const { row } = await rpc(url, key, 'print_result', {
        p_job_id: body.job_id,
        p_claimer: 'agent',
        p_success: body.success,
        p_error: typeof body.error === 'string' ? body.error.slice(0, 500) : null,
        p_from_agent: true,
      });
      if (!row?.success) return NextResponse.json(row, { status: 400 });
      return NextResponse.json(row);
    }

    // ── poll + claim ───────────────────────────────────────────────────────
    if (typeof body.device_key !== 'string' || !body.device_key.trim()) {
      return NextResponse.json({ error: 'device_key required' }, { status: 401 });
    }
    const { row } = await rpc(url, key, 'print_agent_poll', {
      p_device_key: body.device_key.trim(),
      p_max: Number.isInteger(body.max) ? Math.min(Math.max(body.max, 1), 10) : 3,
    });
    if (!row?.success) return NextResponse.json(row, { status: 401 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
