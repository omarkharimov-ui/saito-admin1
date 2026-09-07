import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { fetchSettingsRow, patchSettingsRow, pickAllowed } from '@/lib/settings-svc';

const COLS = [
  'min_order_amount',
  'delivery_fee',
  'free_delivery_threshold',
  'payment_cash',
  'payment_card',
  'cash_close_variance_threshold',
  'cash_close_manager_required',
  'timezone',
  'avg_meal_duration',
  'revenue_limit',
  'inventory_mode',
  'ai_target_revenue',
  'ai_insight_depth',
];

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
