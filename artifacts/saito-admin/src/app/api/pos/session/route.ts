import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const s = svc();

    // Read saito_token from cookie via the request headers in the middleware context
    // Since this is a GET handler, we use cookies() from next/headers
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('saito_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    // Look up session
    const { data: session, error: sessErr } = await s
      .from('sessions')
      .select('user_id, role, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      await s.from('sessions').delete().eq('token', token);
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    // Get staff info from staff table (POS users are staff)
    const { data: staff } = await s
      .from('staff')
      .select('id, name, role, shift')
      .eq('id', session.user_id)
      .maybeSingle();

    if (staff) {
      // Normalize role to match what API auth expects (English lowercase)
      const roleMap: Record<string, string> = {
        'Kassir': 'manager', 'Ofisiant': 'waiter', 'Menecer': 'manager',
        'Barmen': 'waiter', 'Aşpaz': 'waiter', 'Superadmin': 'superadmin',
      };
      const normalizedRole = roleMap[staff.role] || staff.role;
      return NextResponse.json({
        staffId: staff.id,
        name: staff.name,
        role: normalizedRole,
        rawRole: staff.role,
        shift: staff.shift,
      });
    }

    // Fallback: try admin_users table
    const { data: adminUser } = await s
      .from('admin_users')
      .select('id, role')
      .eq('id', session.user_id)
      .maybeSingle();

    if (adminUser) {
      return NextResponse.json({
        staffId: adminUser.id,
        name: 'Admin',
        role: 'Superadmin',
        shift: null,
      });
    }

    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
