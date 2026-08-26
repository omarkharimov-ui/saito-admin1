import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

// Offline/reconnect reconciliation entry point. The client sends operations
// with a stable (client_id, operation_id); the server is authoritative and
// never double-applies an already-synced operation (see sync_operation RPC).
const PERMISSION_BY_TYPE: Record<string, string> = {
  payment: 'payments.create',
  refund: 'payments.refund',
  void: 'payments.void',
  cash_close: 'cash.close',
};

export async function POST(request: NextRequest) {
  const { client_id, operation_id, op_type, payload } = await request.json();
  if (!client_id || !operation_id || !op_type) {
    return NextResponse.json(
      { error: 'client_id, operation_id and op_type are required' },
      { status: 400 }
    );
  }

  const permission = PERMISSION_BY_TYPE[op_type];
  if (!permission) {
    return NextResponse.json({ error: 'Unknown op_type' }, { status: 400 });
  }

  const auth = await requirePermission(permission, [
    'cashier', 'admin', 'superadmin', 'manager', 'waiter', 'kitchen', 'bartender', 'host',
  ]);
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(request, auth.authenticated)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  const supabase = await createAuthClient();
  const { data, error } = await supabase.rpc('sync_operation', {
    p_client_id: client_id,
    p_operation_id: operation_id,
    p_op_type: op_type,
    p_payload: payload ?? {},
    p_performed_by: auth.user?.id || null,
  });

  if (error) {
    console.error('[sync] RPC failed:', error);
    return NextResponse.json({ error: error.message, status: 'rejected' }, { status: 500 });
  }

  return NextResponse.json(data);
}
