import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { resolveWriteLocationContext } from '@/lib/location-context';

// 2026-09-26 (owner, Task 46): lightweight global kitchen summary for the POS
// MƏTBƏX button hint (hazırlanır / hazır / draft across ALL open orders).
// Replaces polling /api/orders every 5s (~1.5 MB per tick) with one small
// aggregation RPC. Location is server-resolved from the operator session —
// never client-supplied (same pattern as /api/orders/pay).
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('orders.view');
    if (!auth.authenticated) return auth;

    const loc = await resolveWriteLocationContext(auth.user!.id);
    if (!loc?.locationId) {
      // No location context → fail closed with empty counts (never leak).
      return NextResponse.json({ ready: 0, prep: 0, draft: 0 });
    }

    const supabase = await createAuthClient();
    const { data, error } = await supabase.rpc('get_kitchen_summary', {
      p_location_id: loc.locationId,
    });

    if (error) {
      console.error('[get_kitchen_summary] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[get_kitchen_summary] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
