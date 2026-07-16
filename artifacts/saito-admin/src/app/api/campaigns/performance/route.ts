import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'cashier']);
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();
    const { data, error } = await supabase
      .from('campaign_performance')
      .select('*')
      .order('campaign_created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
