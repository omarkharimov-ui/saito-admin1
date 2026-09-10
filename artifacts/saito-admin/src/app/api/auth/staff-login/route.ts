import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';
import { verifyPin } from '@/lib/crypto';
import crypto from 'crypto';

// Banned/weak default PINs — login succeeds but flags pin_change_required
// (soft policy per A-FOUNDATION GATE §gate-4.1; HARD block on set/reset = 4.4).
const BANNED_PINS = new Set(['0000', '1234', '1111', '0000', '0001', '2222']);

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0]?.trim()) || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const pin: string = String(body?.pin ?? '').trim();
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: '4 rəqəmli PIN daxil edin' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const ua = (req.headers.get('user-agent') || '').slice(0, 300);

    const client = await createAuthClient();

    // ---- Phase 1: preflight (IP rate-limit + candidate list, all in DB) ----
    const pf = await client.rpc('login_preflight', { p_ip: ip });
    if (pf.error) {
      return NextResponse.json({ error: 'Xəta' }, { status: 500 });
    }
    const preflight: any = pf.data;
    if (preflight?.action === 'ip_locked') {
      return NextResponse.json(
        { error: preflight.message || 'Çoxsaylı uğursuz cəhd' },
        { status: 429 }
      );
    }
    const candidates: any[] = preflight?.candidates ?? [];
    if (candidates.length === 0) {
      // No active staff — still audit as failed attempt (enumeration-neutral).
      await client.rpc('login_commit', {
        p_candidate_id: null, p_success: false, p_ip: ip, p_user_agent: ua,
        p_failure_reason: 'no_active_staff',
      }).catch(() => {});
      return NextResponse.json({ error: 'Yanlış PIN' }, { status: 401 });
    }

    // ---- Phase 2: bounded PBKDF2 verify (Node — PG has no native pbkdf2) ----
    // Constant-ish cost: verify ALL valid-hash candidates (≤ ~5) regardless of
    // match position; weak-hash candidates are skipped here (commit flags them).
    const valid = candidates.filter((c) => !c.weak && typeof c.pin_hash === 'string' && c.pin_hash.startsWith('pbkdf2_sha256$260000'));
    let matched: any = null;
    for (const c of valid) {
      if (verifyPin(pin, c.pin_hash)) matched = c;
    }
    // If only weak-hash staff exist, no one can match → treated as invalid.

    // ---- Phase 3: commit (single transaction in DB: lock / session / audit) ----
    if (matched) {
      const res = await client.rpc('login_commit', {
        p_candidate_id: matched.id,
        p_success: true,
        p_ip: ip,
        p_user_agent: ua,
        p_pin_banned: BANNED_PINS.has(pin),
      });
      if (res.error || !res.data?.success) {
        // Race: staff disabled between preflight and commit → generic 401.
        return NextResponse.json({ error: 'Yanlış PIN' }, { status: 401 });
      }
      const d = res.data;
      const expiresAt = new Date(d.expires_at).toISOString();

      const nextRes = NextResponse.json({
        success: true,
        staffId: d.staff_id,
        name: d.name,
        role: d.role,
        canonicalRole: d.canonical_role,
        shift: d.shift,
        token: d.token,
        expiresAt,
        pinChangeRequired: d.pin_change_required === true,
      });
      nextRes.cookies.set('saito_token', d.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(expiresAt),
        path: '/',
      });
      return nextRes;
    }

    // No match → commit records the failure (staff lock counter / weak-hash event)
    // using the first valid candidate as context is NOT safe for lock attribution
    // without identity; use null → DB logs attempt without staff attribution.
    await client.rpc('login_commit', {
      p_candidate_id: null,
      p_success: false,
      p_ip: ip,
      p_user_agent: ua,
      p_failure_reason: 'invalid_pin',
    });
    return NextResponse.json({ error: 'Yanlış PIN' }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ error: 'Xəta' }, { status: 500 });
  }
}
