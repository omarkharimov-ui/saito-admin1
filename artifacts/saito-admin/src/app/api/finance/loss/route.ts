import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;

  if (!validateCsrfToken(req, auth.authenticated)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  try {
    const supabase = await createAuthClient();
    const body = await req.json();
    const { table_number, reason, reason_text, total_amount, note, order_ids, items } = body;

    if (!table_number || !reason) {
      return NextResponse.json({ error: 'table_number and reason required' }, { status: 400 });
    }

    const staffId = auth.authenticated?.id || null;

    const { data, error: rpcError } = await supabase.rpc('cancel_loss_table', {
      p_table_number: table_number,
      p_reason: reason,
      p_reason_text: reason_text || reason,
      p_total_amount: total_amount || 0,
      p_items: items || [],
      p_performed_by: staffId,
    });

    if (rpcError) {
      console.error('[finance/loss] cancel_loss_table failed:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
