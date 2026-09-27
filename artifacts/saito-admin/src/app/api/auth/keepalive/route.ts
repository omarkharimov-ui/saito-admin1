import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 2026-09-27 (owner: "kassa nie öz-özünə bağlanır bezen"): SLIDING session.
 * A cashier on a 12h shift must not be bounced to /staff/login mid-shift
 * (that remounts the POS and closes the Kassa modal + local state).
 *
 * POST /api/auth/keepalive — while the POS page is visible, the client pings
 * this every 5 min. If the session is valid (token + not expired + staff
 * active), expires_at is extended to now+12h (same window as login_commit)
 * and the cookie's expiry slides forward with it.
 *
 * A truly EXPIRED session is NOT resurrected (security contract unchanged) —
 * this only slides the window while the operator is actively present.
 */
export const dynamic = 'force-dynamic';

const HOURS = 12;

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('saito_token')?.value;
    if (!token) return NextResponse.json({ error: 'No session' }, { status: 401 });

    const s = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: session, error } = await s
      .from('sessions')
      .select('user_id, role, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (error || !session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await s.from('sessions').delete().eq('token', token);
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    // staff must still be active (disabled/banned staff → slide denied)
    const { data: staff } = await s.from('staff').select('id, active').eq('id', session.user_id).maybeSingle();
    if (!staff || staff.active === false) return NextResponse.json({ error: 'Staff inactive' }, { status: 401 });

    const newExpiry = new Date(Date.now() + HOURS * 3600 * 1000).toISOString();
    await s.from('sessions').update({ expires_at: newExpiry }).eq('token', token);

    const res = NextResponse.json({ ok: true, expiresAt: newExpiry });
    res.cookies.set('saito_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(newExpiry),
      path: '/',
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: 'Keepalive failed' }, { status: 500 });
  }
}
