import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

// /api/time-clock/[id]/clock-out
// S-02 (frozen): identity = session token. Target = self or `timeclock.override`.
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
    const { pin, notes } = body;
    if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });

    const res = await s.rpc('clock_out_token', {
      p_token: auth.token,
      p_target_id: id,
      p_pin: pin,
      p_notes: notes ?? null,
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
