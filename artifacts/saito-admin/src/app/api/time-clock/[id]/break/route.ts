import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

// /api/time-clock/[id]/break  — POST = start break, PATCH = end break
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

    const res = await s.rpc('start_break_token', {
      p_token: auth.token,
      p_target_id: id,
      p_break_type: body.breakType || body.break_type || 'unpaid',
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { createAuthClient } = await import('@/lib/api-auth');
    const s = await createAuthClient();
    const { id } = await params;

    const res = await s.rpc('end_break_token', {
      p_token: auth.token,
      p_target_id: id,
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
