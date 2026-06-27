import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateAuth } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function GET() {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;

  const supabase = svc();
  const { data } = await supabase
    .from('admin_users')
    .select('id, email, role, is_active, created_at')
    .order('created_at', { ascending: false });

  return NextResponse.json(data || []);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  const supabase = svc();

  // Delete sessions first
  await supabase.from('sessions').delete().eq('user_id', id);

  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) throw error;

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;

  const supabase = svc();
  const { id, pin: newPin } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  if (newPin) {
    if (!/^\d{4}$/.test(newPin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 });
    }
    const { data: existing } = await supabase.from('admin_users').select('id').eq('pin', newPin).maybeSingle();
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: 'PIN already in use' }, { status: 400 });
    }
  }

  const updates: Record<string, any> = {};
  if (newPin) updates.pin = newPin;

  const { error } = await supabase.from('admin_users').update(updates).eq('id', id);
  if (error) throw error;

  return NextResponse.json({ success: true });
}
