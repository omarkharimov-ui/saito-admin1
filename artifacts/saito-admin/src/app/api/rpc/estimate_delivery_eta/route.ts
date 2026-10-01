import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// 11q (owner, idea D: "Restoran yoğunluğuna görə dinamik ETA"): the POS
// delivery panel promises an ETA that reflects the LIVE kitchen queue, not a
// static zone value — 20 queued items ⇒ 30 dk → 50 dk, so the customer is
// never over-promised. The math lives in the DB function
// `estimate_delivery_eta(p_zone_id)` (zone range + queued-item load, capped).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const p_zone_id = body?.p_zone_id || null;
    if (!p_zone_id) return NextResponse.json({ error: 'ZONE_REQUIRED' }, { status: 400 });

    const supabase = await createAuthClient();
    const { data, error } = await supabase.rpc('estimate_delivery_eta', { p_zone_id });
    if (error) {
      console.error('[estimate_delivery_eta] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[estimate_delivery_eta] unexpected error:', e?.message);
    return NextResponse.json({ error: e?.message || 'INTERNAL' }, { status: 500 });
  }
}
