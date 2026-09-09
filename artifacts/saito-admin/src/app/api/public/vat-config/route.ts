import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/**
 * 1.5 — Public VAT config for QR/anonymous customer screens.
 * Returns ONLY the two fields the client needs for its display estimate.
 * Full total is always computed server-side (SSOT) in /api/orders/qr.
 */
export async function GET() {
  try {
    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/settings?select=vat_enabled,vat_percentage&limit=1`, {
      headers: s.headers,
    });
    if (!res.ok) return NextResponse.json({ vat_enabled: false, vat_percentage: 18 });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ vat_enabled: false, vat_percentage: 18 });
    }
    return NextResponse.json({
      vat_enabled: !!rows[0].vat_enabled,
      vat_percentage: Number(rows[0].vat_percentage) || 18,
    });
  } catch {
    return NextResponse.json({ vat_enabled: false, vat_percentage: 18 });
  }
}
