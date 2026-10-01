import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// ============================================================================
// 2026-10-01 (11w-A, owner: "daha da yaxşı"): PHONE → LAST DELIVERY ADDRESS.
// Regular customer: type the phone → their previous address appears → one tap
// (or auto-fill when the field is empty) → the existing geocode/auto-zone
// pipeline resolves KM + zone + OSRM time from the stored address string.
// 100% local (Supabase orders table) — zero external API calls.
//
// Matching: last-10-digits (phones are stored in mixed formats:
// "+994 50 123 45 67", "0501234567", "994501234567" — digits-only suffix is
// the only stable identity for a Baku mobile).
// ============================================================================

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const phone = (req.nextUrl.searchParams.get('phone') || '').replace(/\D/g, '');
    if (phone.length < 10) return NextResponse.json({ address: null });
    const last10 = phone.slice(-10);

    const supabase = await createAuthClient();
    const { data } = await supabase
      .from('orders')
      .select('customer_phone, delivery_address, customer_name, created_at')
      .not('customer_phone', 'is', null)
      .not('delivery_address', 'is', null)
      .order('created_at', { ascending: false })
      .limit(80);

    const rows = (data || []).filter((o: any) =>
      String(o.customer_phone || '').replace(/\D/g, '').endsWith(last10),
    );
    if (!rows.length) return NextResponse.json({ address: null, count: 0 });
    return NextResponse.json({
      address: rows[0].delivery_address,
      name: rows[0].customer_name || null,
      count: rows.length,
      last: rows[0].created_at,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
