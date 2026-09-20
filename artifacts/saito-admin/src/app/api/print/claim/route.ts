import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveReadLocationScope } from '@/lib/location-context';

// pr v1 — terminal claim loop (POS / KDS).
// Body: { terminal_id, max? }
// D-5: location is SERVER-DERIVED (read scope — single-location fallback).
// Claims up to `max` QUEUED jobs routed to BROWSER devices of the location
// (FOR UPDATE SKIP LOCKED — two terminals never double-claim). Returns the
// claimed jobs with device context for the client print flow.
// Stale claims (> 5 min without result) are requeued first.
// SECURITY CHAIN (Rule 10): staff session → requireAuth → service_role →
// print_claim() RPC.

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    if (typeof body.terminal_id !== 'string' || !body.terminal_id.trim()) {
      return NextResponse.json({ error: 'terminal_id required' }, { status: 400 });
    }
    const scope = await resolveReadLocationScope(auth.user!.id);
    if (!scope) return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/rpc/print_claim`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_location_id: scope.locationId,
        p_terminal_id: body.terminal_id.trim().slice(0, 80),
        p_max: Number.isInteger(body.max) ? Math.min(Math.max(body.max, 1), 10) : 3,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Claim failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const jobs = Array.isArray(data) ? data : [];
    return NextResponse.json({ jobs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
