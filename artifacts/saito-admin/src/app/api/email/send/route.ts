import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { sendReservationEmail, loadEmailCfg } from '@/lib/resv-email';

/**
 * 2026-09-26 (owner): reservation e-mail sender — manual path
 * (Settings test + rezerv "EMAIL GÖNDƏR"). Engine: lib/resv-email.ts
 * (shared with auto-confirm on create + daily reminder cron).
 *
 * POST { to, template: 'test'|'confirm'|'remind', reservation_id? }
 */

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await req.json();
    const to: string = String(body.to || '').trim();
    const template: 'test' | 'confirm' | 'remind' =
      ['test', 'confirm', 'remind'].includes(body.template) ? body.template : 'test';
    const reservationId: string | null = body.reservation_id || null;

    if (template === 'test') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return NextResponse.json({ error: 'err_bad_email' }, { status: 400 });
      }
      const r = await sendReservationEmail({ to, template });
      if (r.code === 'smtp_not_configured') return NextResponse.json({ error: 'smtp_not_configured' }, { status: 400 });
      if (r.code === 'email_disabled') return NextResponse.json({ error: 'email_disabled' }, { status: 400 });
      if (!r.sent) return NextResponse.json({ error: r.error || 'send failed' }, { status: 502 });
      return NextResponse.json({ success: true });
    }

    // confirm / remind — load the reservation for template vars
    const { cfg } = await loadEmailCfg().catch(() => ({ cfg: null }));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    let reservation: any = null;
    if (reservationId && url && key) {
      const rRes = await fetch(`${url}/rest/v1/reservations?id=eq.${encodeURIComponent(reservationId)}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const rows = await rRes.json().catch(() => []);
      reservation = rows?.[0] || null;
    }
    if (!reservation) {
      return NextResponse.json({ error: 'resv_not_found' }, { status: 404 });
    }

    const r = await sendReservationEmail({ to: to || reservation.email || null, template, reservation, reservation_id: reservationId });
    if (r.code === 'smtp_not_configured') return NextResponse.json({ error: 'smtp_not_configured' }, { status: 400 });
    if (r.code === 'email_disabled') return NextResponse.json({ error: 'email_disabled' }, { status: 400 });
    if (r.code === 'no_recipient') return NextResponse.json({ error: 'err_bad_email' }, { status: 400 });
    if (!r.sent) return NextResponse.json({ error: r.error || 'send failed' }, { status: 502 });
    return NextResponse.json({ success: true, to: r.to });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
