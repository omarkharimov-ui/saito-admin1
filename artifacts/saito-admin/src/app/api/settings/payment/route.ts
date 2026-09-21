import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { fetchSettingsRow, patchSettingsRow, pickAllowed } from '@/lib/settings-svc';

/**
 * Global payment / tax switches (Settings → Payment).
 *
 * `auto_apply_vat` is the SINGLE global EDV switch: new orders (POS dine-in,
 * takeaway RPC, QR) are created with apply_vat = auto_apply_vat. The old
 * per-order toggle lived in the POS payment sheet (manager-PIN gated) and was
 * removed — the restaurant-level decision now belongs here.
 * `vat_percentage` is the tax rate used by calculate_order_total_v3.
 */
const COLS = ['auto_apply_vat', 'vat_percentage'];

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const row = await fetchSettingsRow(COLS);
    return NextResponse.json({ settings: row });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission('settings.admin');
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(req, true)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { updates } = pickAllowed(body, COLS);
    const res = await patchSettingsRow(updates);
    if (!res.ok) return NextResponse.json({ error: res.error || 'Update failed' }, { status: res.status });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
