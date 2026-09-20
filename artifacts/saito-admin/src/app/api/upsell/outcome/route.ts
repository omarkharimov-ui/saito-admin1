import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// Wave B #3 (v2) — record the outcome of a shown offer.
// POST { offer_id: string, outcome: 'accepted' | 'dismissed' }
//
// This is the "RECORD OUTCOME" step of the offer contract: the budget
// (max 1 accepted / max 2 shown) and the dismiss-cooldown decisions on the
// next /api/upsell/suggest call are driven by these rows. Fire-and-forget
// from the client — a failed outcome call must never block the cashier.
// SECURITY CHAIN (Rule 10): staff session → requireAuth → service_role →
// UPDATE upsell_offers (service_role-only table).

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    const offerId = typeof body.offer_id === 'string' && body.offer_id ? body.offer_id : null;
    const outcome = body.outcome === 'accepted' || body.outcome === 'dismissed' ? body.outcome : null;
    if (!offerId || !outcome) {
      return NextResponse.json({ error: 'offer_id + outcome (accepted|dismissed) required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const res = await fetch(`${url}/rest/v1/upsell_offers?id=eq.${offerId}`, {
      method: 'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ outcome, resolved_at: new Date().toISOString() }),
    });
    if (!res.ok) return NextResponse.json({ error: `Outcome record failed: ${await res.text()}` }, { status: 500 });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, offer_id: offerId, outcome });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
