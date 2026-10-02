import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { requireKdsAction } from '@/lib/kds-guard';

/**
 * POST /api/kitchen/fire-course
 * 12q (kitchen gap sweep, Lightspeed parity: "course-based firing rules"):
 * fire a course — that course's pending/accepted items go 'preparing'
 * (course NULL is treated as 'main' by fire_course_atomic). The kitchen can
 * hold later courses (main/drink) while the first one is plated.
 */
export async function POST(req: NextRequest) {
  try {
    const { order_id, course } = await req.json();
    if (!order_id || !course) return NextResponse.json({ error: 'order_id and course required' }, { status: 400 });

    const g = await requireKdsAction({ order_id }, 'kitchen.manage');
    if (!g.ok) return g.res;

    const supabase = await createAuthClient(); // service role
    const { data, error } = await supabase.rpc('fire_course_atomic', {
      p_order_id: order_id,
      p_course: String(course),
      p_performed_by: g.performed_by,
    });
    if (error) {
      const m = String(error.message || '');
      if (m.includes('PERMISSION_DENIED')) return NextResponse.json({ success: false, error: 'PERMISSION_DENIED', detail: m }, { status: 403 });
      if (m.includes('ORDER_FINALIZED')) return NextResponse.json({ success: false, error: 'ORDER_FINALIZED' }, { status: 409 });
      return NextResponse.json({ error: m }, { status: 500 });
    }
    if (data && data.success === false) return NextResponse.json(data, { status: 400 });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /kitchen/fire-course] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
