import { NextResponse } from 'next/server';
import { validateAuth, createAuthClient } from '@/lib/api-auth';

// /api/staff/clock  (mobile app)
// body: { action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end', pin?, break_type? }
// S-02 (frozen): identity = session token; this is always SELF (mobile = own clock).
// The DB token RPCs also allow `timeclock.override` on a target, but mobile acts on self.
export async function POST(req: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const id = auth.user!.id;
    const s = await createAuthClient();
    const body = await req.json().catch(() => ({}));
    const { action, pin, break_type } = body;
    const source = 'mobile_app';
    const bad = (data: any, code = 400) =>
      NextResponse.json(data, { status: data?.success === false ? (data?.error === 'PERMISSION_DENIED' ? 403 : code) : 200 });

    if (action === 'clock_in') {
      if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
      const r = await s.rpc('clock_in_token', { p_token: auth.token, p_target_id: id, p_pin: pin, p_source: source });
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      return bad(r.data);
    }
    if (action === 'clock_out') {
      if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
      const r = await s.rpc('clock_out_token', { p_token: auth.token, p_target_id: id, p_pin: pin, p_notes: body.notes ?? null });
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      return bad(r.data);
    }
    if (action === 'break_start') {
      const r = await s.rpc('start_break_token', { p_token: auth.token, p_target_id: id, p_break_type: break_type || 'unpaid' });
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      return bad(r.data);
    }
    if (action === 'break_end') {
      const r = await s.rpc('end_break_token', { p_token: auth.token, p_target_id: id });
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      return bad(r.data);
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
