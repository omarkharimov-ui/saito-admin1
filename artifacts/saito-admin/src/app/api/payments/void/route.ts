import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  const auth = await requirePermission('payments.void', ['cashier', 'admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(request, auth.authenticated)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  const supabase = await createAuthClient();
  const { payment_id, reason } = await request.json();
  if (!payment_id) {
    return NextResponse.json({ error: 'payment_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('void_payment_atomic', {
    p_payment_id: payment_id,
    p_reason: reason || null,
    p_performed_by: auth.user?.id || null,
  });

  if (error) {
    console.error('[void] RPC failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
