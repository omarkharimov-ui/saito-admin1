import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api-auth';

/**
 * /api/pos/delivery-status — Delivery Phase 2 (2026-09-24).
 *
 * Lightweight, ANY-staff authenticated read of the delivery gates the POS
 * needs (master switch, accepting pause, global min order). The browser POS
 * CANNOT read `settings` directly — it has RLS and the browser session is
 * anon (401, caught by the Phase 2 E2E) — so this is the POS's gate source.
 * BDS reads the same values from the /api/orders poll; Settings writes them.
 * Fail-open: a settings read error returns enabled+accepting (the server gate
 * in /api/orders remains authoritative).
 */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const s = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await s
      .from('settings')
      .select('delivery_enabled, delivery_accepting_orders, min_order_amount')
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      enabled: data?.delivery_enabled !== false,
      accepting: data?.delivery_accepting_orders !== false,
      minOrder: data?.min_order_amount != null ? Number(data.min_order_amount) : null,
    });
  } catch (e: any) {
    console.error('[API /pos/delivery-status]', e?.message);
    return NextResponse.json({ enabled: true, accepting: true, minOrder: null });
  }
}
