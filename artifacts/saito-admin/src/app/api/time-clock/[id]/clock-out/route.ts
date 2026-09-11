import { NextResponse } from 'next/server';
import { validateAuth, createAuthClient } from '@/lib/api-auth';
import { verifyPin } from '@/lib/crypto';

// /api/time-clock/[id]/clock-out
// S-02: identity = session token; target = self or `timeclock.override` (enforced in DB).
// S-03: PIN verified in TS (A-frozen verifyPin, PBKDF2-260k) on the target's pin_hash;
// RPC is PIN-agnostic.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const s = await createAuthClient();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const pin: string = String(body?.pin ?? '').trim();
    if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
    const notes: string | null = body.notes ?? null;

    const t = await s.from('staff').select('id,pin_hash,is_active').eq('id', id).maybeSingle();
    if (t.error || !t.data || !t.data.is_active) {
      return NextResponse.json({ error: 'Staff not found or inactive' }, { status: 404 });
    }
    if (!verifyPin(pin, String(t.data.pin_hash ?? ''))) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    const res = await s.rpc('clock_out_token', {
      p_token: auth.token,
      p_target_id: id,
      p_notes: notes,
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
