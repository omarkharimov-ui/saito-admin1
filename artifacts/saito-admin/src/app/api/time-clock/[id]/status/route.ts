import { NextResponse } from 'next/server';
import { validateAuth, createAuthClient } from '@/lib/api-auth';

// GET /api/time-clock/[id]/status
// G-2 (FINAL GATE): previously had NO authentication → any client could read
// ANY staff's clock status (hours/break/OT flags). Now: requireAuth + the
// caller must be the staff themselves OR hold `timeclock.override` (same rule
// as the write RPCs).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const s = await createAuthClient();
    const { id } = await params;
    const actorId: string | null = auth.user?.id ?? null;

    // authorization: self or timeclock.override
    if (actorId && actorId !== id) {
      const perm = await s.rpc('has_permission', { p_staff_id: actorId, p_permission: 'timeclock.override' });
      if (perm.error || !perm.data) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    const res = await s.rpc('get_time_clock_status', { p_staff_id: id });
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    return NextResponse.json(res.data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
