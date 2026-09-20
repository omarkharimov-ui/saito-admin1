import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// pr v1 — report print result for a claimed job (terminal browser prints).
// Body: { job_id, terminal_id, success, error? }
// claimed → printed | failed (+ error). Terminal can only close jobs IT
// claimed (RPC guard). Network agents report through /api/print/agent/poll
// + the from_agent path, not here.
// SECURITY CHAIN (Rule 10): staff session → requireAuth → service_role →
// print_result() RPC (audit inside).

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    if (!body.job_id || typeof body.terminal_id !== 'string' ||
        typeof body.success !== 'boolean') {
      return NextResponse.json({ error: 'job_id, terminal_id and success (boolean) required' }, { status: 400 });
    }
    const res = await fetch(`${url}/rest/v1/rpc/print_result`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_job_id: body.job_id,
        p_claimer: body.terminal_id.trim().slice(0, 80),
        p_success: body.success,
        p_error: typeof body.error === 'string' ? body.error.slice(0, 500) : null,
        p_from_agent: false,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Result failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return NextResponse.json(row, { status: 400 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
