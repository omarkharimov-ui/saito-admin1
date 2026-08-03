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
      await supabase.from('audit_logs').insert({
        staff_id: adminUser.id,
        staff_name: adminUser.role,
        action: actionType,
        target_type: 'pos',
        details: { method: 'admin_users' },
      });
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
      await supabase.from('audit_logs').insert({
        staff_id: staffUser.id,
        staff_name: staffUser.name,
        action: actionType,
        target_type: 'pos',
        details: { method: 'staff' },
      });
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
