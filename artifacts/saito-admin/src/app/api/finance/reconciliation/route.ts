import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;

  try {
    const supabase = await createAuthClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;

    const { data, error } = await supabase.rpc('payment_reconciliation', {
      p_date: date || undefined,
      p_performed_by: auth.user?.id || null,
    });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
