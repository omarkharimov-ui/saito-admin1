import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// GC (Wave A #3, 2026-09-20): gift card report strip — read-only aggregates.
// SECURITY CHAIN (Rule 10): staff session -> requireAuth -> service_role
// key -> read-only gift_card_summary() RPC (pure SELECT) -> no writes.

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const res = await fetch(`${url}/rest/v1/rpc/gift_card_summary`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Summary lookup failed: ${t}` }, { status: 500 });
    }

    const row = await res.json();
    return NextResponse.json(Array.isArray(row) ? row[0] : row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
