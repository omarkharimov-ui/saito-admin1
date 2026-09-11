import { NextResponse } from 'next/server';
import { validateAuth, createAuthClient } from '@/lib/api-auth';
import { verifyPin } from '@/lib/crypto';

// /api/staff/clock  (mobile app)
// body: { action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end', pin?, break_type? }
// S-02: identity = session token; mobile acts on SELF.
// S-03: PIN verified in TS (A-frozen verifyPin, PBKDF2-260k) on the self pin_hash;
//       clock_in_token/clock_out_token are PIN-agnostic. break_* never required a PIN.
export async function POST(req: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const id = auth.user!.id;
    const s = await createAuthClient();
    const body = await req.json().catch(() => ({}));
    const { action, pin, break_type, notes } = body;
    const source = 'mobile_app';
    const bad = (data: any, code = 400) =>
      NextResponse.json(data, { status: data?.success === false ? (data?.error === 'PERMISSION_DENIED' ? 403 : code) : 200 });

    // S-03 helper: fetch self pin_hash + verify the supplied PIN (A-frozen verifyPin).
    const verifySelfPin = async (): Promise<boolean> => {
      const p: string = String(pin ?? '').trim();
      if (!p) return false;
      const me = await s.from('staff').select('pin_hash').eq('id', id).maybeSingle();
      return verifyPin(p, String(me.data?.pin_hash ?? ''));
    };

    if (action === 'clock_in') {
      if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
      if (!(await verifySelfPin())) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
      const r = await s.rpc('clock_in_token', { p_token: auth.token, p_target_id: id, p_source: source });
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      return bad(r.data);
    }
    if (action === 'clock_out') {
      if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
      if (!(await verifySelfPin())) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
      const r = await s.rpc('clock_out_token', { p_token: auth.token, p_target_id: id, p_notes: notes ?? null });
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
