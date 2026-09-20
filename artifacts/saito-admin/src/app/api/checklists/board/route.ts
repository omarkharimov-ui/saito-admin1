import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// Wave A #5 (2026-09-20, map §21 J) — daily operating checklists.
// Board = today's runs with progress. ANY authenticated staff may read
// (floor staff see their day). Side effect: lazy materialization of due
// daily templates (idempotent — see checklist_board / 20260920000008).
// SECURITY CHAIN (Rule 10): staff session → requireAuth → service_role →
// checklist_board() RPC.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const date = dateParam && DATE_RE.test(dateParam) ? dateParam : null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const res = await fetch(`${url}/rest/v1/rpc/checklist_board`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_date: date }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Board failed: ${t}` }, { status: 500 });
    }
    const data = await res.json();
    const runs = Array.isArray(data) ? data : Array.isArray(data?.[0]) ? data[0] : data;
    return NextResponse.json(runs);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
