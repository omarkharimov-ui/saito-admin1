import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

// /api/time-clock/[id]/clock-in
// S-02 (frozen): identity = session token (DB-verified). Target = [id] param,
// allowed only for self or a staff with `timeclock.override` (enforced in DB).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { createAuthClient } = await import('@/lib/api-auth');
    const s = await createAuthClient();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { pin, source } = body;
    if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });

    const res = await s.rpc('clock_in_token', {
      p_token: auth.token,
      p_target_id: id,
      p_pin: pin,
      p_source: source || 'pos_terminal',
    });
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    const data: any = res.data;
    return NextResponse.json(data, {
      status: data?.success === false ? (data?.error === 'PERMISSION_DENIED' ? 403 : 400) : 200,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
