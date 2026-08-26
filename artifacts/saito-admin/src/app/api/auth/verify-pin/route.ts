import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPin } from '@/lib/crypto';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const VALID_ACTIONS = ['void_item', 'loss', 'dismiss', 'reprint', 'merge', 'transfer', 'admin'];

export async function POST(req: NextRequest) {
  try {
    const { pin, action } = await req.json();
    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ valid: false, error: 'PIN formatı yanlışdır' }, { status: 400 });
    }

    const actionType = VALID_ACTIONS.includes(action) ? action : 'admin';
    const supabase = svc();

    // Check admin_users table
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('id, role, pin_hash')
      .eq('is_active', true)
      .limit(1000);

    const adminUser = (adminUsers || []).find((u: any) => u.pin_hash && verifyPin(pin, u.pin_hash));
    if (adminUser) {
      try { await supabase.rpc('log_audit', { p_action: actionType, p_entity_type: 'staff', p_entity_id: adminUser.id, p_actor_id: adminUser.id, p_actor_name: adminUser.role, p_old_data: null, p_new_data: { method: 'admin_users', target_type: 'pos' }, p_metadata: { pin_verified: true, method: 'admin_users' } }); } catch { /* non-critical */ }
      return NextResponse.json({ valid: true, role: adminUser.role, staffId: adminUser.id });
    }

    // Check staff table (Superadmin/Menecer roles)
    const { data: staffUsers } = await supabase
      .from('staff')
      .select('id, name, role, pin_hash')
      .eq('is_active', true)
      .in('role', ['Superadmin', 'Menecer'])
      .limit(100);

    const staffUser = (staffUsers || []).find((u: any) => u.pin_hash && verifyPin(pin, u.pin_hash));
    if (staffUser) {
      try { await supabase.rpc('log_audit', { p_action: actionType, p_entity_type: 'staff', p_entity_id: staffUser.id, p_actor_id: staffUser.id, p_actor_name: staffUser.name, p_old_data: null, p_new_data: { method: 'staff', target_type: 'pos' }, p_metadata: { pin_verified: true, method: 'staff' } }); } catch { /* non-critical */ }
      return NextResponse.json({
        valid: true,
        role: staffUser.role.toLowerCase(),
        staffId: staffUser.id,
        name: staffUser.name,
      });
    }

    return NextResponse.json({ valid: false, error: 'PIN yanlışdır' }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ valid: false, error: e.message }, { status: 500 });
  }
}
