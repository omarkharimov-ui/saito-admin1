import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    // 2026-09-24 (Delivery Phase 1): two overloads share the name —
    //   legacy (p_zone_name, p_order_amount, p_customer_address)  [frozen]
    //   distance (p_zone_name, p_order_amount, p_distance_km)     [new]
    // PostgREST resolves overloads by parameter NAME, so we dispatch on which
    // key the caller sent (never both).
    const isDistance = body.p_distance_km !== undefined && body.p_distance_km !== null && body.p_distance_km !== '';
    const args = isDistance
      ? {
          p_zone_name: body.p_zone_name || null,
          p_order_amount: body.p_order_amount || 0,
          p_distance_km: Number(body.p_distance_km),
        }
      : {
          p_zone_name: body.p_zone_name || null,
          p_order_amount: body.p_order_amount || 0,
          p_customer_address: body.p_customer_address || null,
        };
    const { data, error } = await supabase.rpc('calculate_delivery_fee', args);

    if (error) {
      console.error('[calculate_delivery_fee] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[calculate_delivery_fee] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}