import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { hashPin } from '@/lib/crypto';

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

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;

  const supabase = svc();

  try {
    const { role } = await req.json();

    const validRoles = ['admin', 'kitchen', 'cashier'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Valid role required' }, { status: 400 });
    }

    const pin = generatePin();
    const pinHash = hashPin(pin);

    const { data: roleData } = await supabase
      .from('roles')
      .select('id')
      .eq('name', role)
      .maybeSingle();

    const roleId = roleData?.id || null;

    const { data: staff, error: insertError } = await supabase
      .from('staff')
      .insert({
        name: role.charAt(0).toUpperCase() + role.slice(1),
        role: role,
        role_id: roleId,
        pin_hash: pinHash,
        is_active: true,
      })
      .select('id, name, role')
      .single();

    if (insertError || !staff) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    try {
      await supabase.rpc('log_audit', {
        p_action: 'create_staff',
        p_entity_type: 'staff',
        p_entity_id: staff.id,
        p_actor_id: auth.user?.id,
        p_actor_name: 'superadmin',
        p_old_data: null,
        p_new_data: { name: staff.name, role: staff.role },
        p_metadata: { method: 'send-code' }
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ 
      success: true, 
      staffId: staff.id, 
      role: staff.role
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create user' }, { status: 500 });
  }
}
