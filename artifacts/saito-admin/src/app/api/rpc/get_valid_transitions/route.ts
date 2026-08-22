import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const supabase = await createAuthClient();

    const { data, error } = await supabase.rpc('get_valid_transitions', {
      p_entity: body.p_entity,
      p_current_status: body.p_current_status,
    });

    if (error) {
      console.error('[get_valid_transitions] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[get_valid_transitions] Fatal:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
