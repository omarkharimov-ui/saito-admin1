import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['superadmin']);
    if (!auth.authenticated) return auth;

    const supabase = svc();

    const { error } = await supabase.from('recipes').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[ClearAll Recipes] Error:', e.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
