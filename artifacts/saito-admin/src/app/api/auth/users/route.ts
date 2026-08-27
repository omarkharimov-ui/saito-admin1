import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission, sanitizeStaffArray } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';
import { hashPin } from '@/lib/crypto';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const auth = await requirePermission('staff.manage', ['superadmin']);
  if (!auth.authenticated) return auth;

  const supabase = svc();
  const { data } = await supabase
    .from('staff')
    .select('id, name, role, role_id, is_active, created_at')
    .order('created_at', { ascending: false });

  return NextResponse.json(sanitizeStaffArray(data || []));
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission('staff.manage', ['superadmin']);
  if (!auth.authenticated) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  const supabase = svc();

  await supabase.from('sessions').delete().eq('user_id', id);

  const { error } = await supabase
    .from('staff')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission('staff.manage', ['superadmin']);
  if (!auth.authenticated) return auth;

  const supabase = svc();
  const { id, pin: newPin } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  const updates: Record<string, any> = {};

  if (newPin) {
    if (!/^\d{4}$/.test(newPin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 });
    }
    const { data: existing } = await supabase.from('staff').select('id, pin_hash').eq('pin_hash', hashPin(newPin)).maybeSingle();
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: 'PIN already in use' }, { status: 400 });
    }
    updates.pin_hash = hashPin(newPin);
  }

  const { error } = await supabase.from('staff').update(updates).eq('id', id);
  if (error) throw error;

  return NextResponse.json({ success: true });
}
