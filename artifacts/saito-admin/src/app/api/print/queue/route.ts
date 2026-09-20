import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveReadLocationScope } from '@/lib/location-context';

// pr v1 — lightweight queue counts for the terminal print badge.
// GET ?terminal_id=… → { queued, claimed_mine }
// D-5: location is SERVER-DERIVED (read scope).
// SECURITY CHAIN (Rule 10): staff session → requireAuth → D-5 location →
// service_role → print_queue_counts() RPC.

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const terminalId = request.nextUrl.searchParams.get('terminal_id') || '';
    if (!terminalId) {
      return NextResponse.json({ error: 'terminal_id required' }, { status: 400 });
    }
    const scope = await resolveReadLocationScope(auth.user!.id);
    if (!scope) return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    const res = await fetch(`${url}/rest/v1/rpc/print_queue_counts`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_location_id: scope.locationId, p_terminal_id: terminalId }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Queue counts failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data[0] : data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
