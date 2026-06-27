import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;

  try {
    const { userId, newPin } = await req.json();

    if (!userId || !newPin) {
      return NextResponse.json({ error: 'userId and newPin required' }, { status: 400 });
    }

    if (!/^\d{4}$/.test(newPin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 });
    }

    const supabase = svc();

    const { data: existing } = await supabase
      .from('admin_users')
      .select('id')
      .eq('pin', newPin)
      .neq('id', userId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'PIN already in use by another user' }, { status: 400 });
    }

    const { error } = await supabase
      .from('admin_users')
      .update({ pin: newPin })
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to change PIN' }, { status: 500 });
  }
}
