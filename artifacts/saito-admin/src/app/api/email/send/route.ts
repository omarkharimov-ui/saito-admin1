import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import nodemailer from 'nodemailer';

/**
 * 2026-09-26 (owner): "settingsden email daxil edib (business maili) sonra
 * mail gondermek olsun" — reservation confirm/reminder e-mail sender.
 *
 * POST { to, template: 'test'|'confirm'|'remind', reservation_id? }
 *  - test    → sent to `to` (from the Settings test button)
 *  - confirm → reservation confirmation (name/date/time/guests/deposit/VIP)
 *  - remind  → day-before / day-of reminder
 *
 * SMTP config: settings.email_settings (set in Settings → Notifications).
 * Every attempt (sent/failed) lands in email_logs (audit DNA).
 * On confirm/remind with reservation_id, the guest `to` is persisted to
 * reservations.email so the next send is one-tap.
 */

type Template = 'test' | 'confirm' | 'remind';

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function layout(restaurant: string, inner: string): string {
  return `
  <div style="background:#0c0c10;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#141419;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
      <div style="background:#D4AF37;padding:18px 24px;">
        <span style="color:#000;font-size:18px;font-weight:900;letter-spacing:0.06em;">${esc(restaurant) || 'SAITO'}</span>
      </div>
      <div style="padding:24px;color:#e5e5ea;font-size:14px;line-height:1.6;">${inner}</div>
      <div style="padding:14px 24px;border-top:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.3);font-size:11px;">
        Saito OS · bu mail avtomatik göndərilib
      </div>
    </div>
  </div>`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await req.json();
    const to: string = String(body.to || '').trim();
    const template: Template = ['test', 'confirm', 'remind'].includes(body.template) ? body.template : 'test';
    const reservationId: string | null = body.reservation_id || null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'err_bad_email' }, { status: 400 });
    }

    const supabase = await createAuthClient();

    // 1) SMTP config
    const { data: srow, error: sErr } = await supabase
      .from('settings').select('email_settings,restaurant_name,contact_email').limit(1);
    if (sErr) throw sErr;
    const cfg = srow?.[0]?.email_settings || {};
    const restaurant = srow?.[0]?.restaurant_name || 'Saito';
    const from = (cfg.from || srow?.[0]?.contact_email || '') as string;

    if (!cfg.host || !cfg.user || !cfg.pass) {
      return NextResponse.json({ error: 'smtp_not_configured' }, { status: 400 });
    }
    if (cfg.enabled === false) {
      return NextResponse.json({ error: 'email_disabled' }, { status: 400 });
    }

    // 2) Reservation vars (confirm/remind)
    let vars: Record<string, any> = {};
    if (template !== 'test' && reservationId) {
      const { data: rrow, error: rErr } = await supabase
        .from('reservations').select('*').eq('id', reservationId).maybeSingle();
      if (rErr) throw rErr;
      vars = rrow || {};
    }

    let subject: string;
    let inner: string;
    if (template === 'test') {
      subject = `SAITO — test maili`;
      inner = `<p style="font-size:16px;font-weight:800;">SMTP bağlantısı uğurludur ✓</p>
               <p style="color:rgba(255,255,255,0.55);font-size:12px;">Bu test maili ${esc(from)} ünvanından göndərildi.</p>`;
    } else {
      const name = esc(vars.name || 'qəymətli qonağımız');
      const date = esc(String(vars.date || '').slice(0, 10));
      const time = esc(vars.time || '');
      const guests = Number(vars.guests) || Number(vars.guest_count) || 0;
      const deposit = Number(vars.deposit_amount) > 0 ? `<p style="color:#D4AF37;font-size:13px;font-weight:700;">Depozit: ₼${Number(vars.deposit_amount).toFixed(0)}</p>` : '';
      const vip = vars.is_vip ? '<p style="color:#D4AF37;font-size:13px;font-weight:800;">★ VIP rezervasiya</p>' : '';
      if (template === 'confirm') {
        subject = `Rezervasiya təsdiqlənib — ${date} ${time}`;
        inner = `<p style="font-size:16px;font-weight:800;">Salam ${name},</p>
                 <p>Rezervasiyanız təsdiqlənib:</p>
                 <p style="font-size:15px;"><b>${date}</b> · <b>${time}</b>${guests ? ` · <b>${guests} nəfər</b>` : ''}</p>
                 ${vip}${deposit}
                 <p style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:16px;">Görüşə qədər!<br/>${esc(restaurant)}</p>`;
      } else {
        subject = `Xatırlatma — ${date} ${time}`;
        inner = `<p style="font-size:16px;font-weight:800;">Salam ${name},</p>
                 <p>Rezervasiyanızı xatırladırırıq:</p>
                 <p style="font-size:15px;"><b>${date}</b> · <b>${time}</b>${guests ? ` · <b>${guests} nəfər</b>` : ''}</p>
                 ${vip}${deposit}
                 <p style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:16px;">Görüşə qədər!<br/>${esc(restaurant)}</p>`;
      }
    }

    // 3) Send
    const port = Number(cfg.port) || 587;
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port,
      secure: port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    let status: 'sent' | 'failed' = 'sent';
    let error: string | null = null;
    try {
      await transporter.sendMail({ from: `"${restaurant}" <${from}>`, to, subject, html: layout(restaurant, inner) });
    } catch (e: any) {
      status = 'failed';
      error = e?.message || 'send failed';
    }

    // 4) Persist guest email (one-tap next time)
    if (template !== 'test' && reservationId && status === 'sent') {
      await supabase.from('reservations').update({ email: to }).eq('id', reservationId);
    }

    // 5) Audit log
    const { error: logErr } = await supabase.from('email_logs').insert({
      to_addr: to,
      template,
      reservation_id: reservationId,
      status,
      error,
      meta: { from, restaurant },
    });
    if (logErr) console.error('[email/send] log insert failed:', logErr.message);

    if (status === 'failed') {
      return NextResponse.json({ error: error }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
