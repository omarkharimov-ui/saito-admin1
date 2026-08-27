import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const s = svc();

    const { data: activeShifts, error: shiftError } = await s
      .from('shifts')
      .select('staff_id, opened_at')
      .is('closed_at', null)
      .order('opened_at', { ascending: false });

    if (shiftError) {
      return NextResponse.json({ error: shiftError.message }, { status: 500 });
    }

    const staffIds = (activeShifts || []).map((s: any) => s.staff_id);
    let staffList: any[] = [];

    if (staffIds.length > 0) {
      const { data: staff, error: staffError } = await s
        .from('staff')
        .select('id, name, role, shift')
        .in('id', staffIds)
        .eq('is_active', true);

      if (staffError) {
        return NextResponse.json({ error: staffError.message }, { status: 500 });
      }

      staffList = (staff || []).map((st: any) => {
        const shift = (activeShifts || []).find((sh: any) => sh.staff_id === st.id);
        return {
          id: st.id,
          name: st.name,
          role: st.role,
          shift: st.shift,
          clockedInAt: shift?.opened_at || null,
        };
      });
    }

    return NextResponse.json({
      activeStaff: staffList,
      count: staffList.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
