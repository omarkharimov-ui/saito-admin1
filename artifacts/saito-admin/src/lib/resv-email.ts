/**
 * 2026-09-26 (owner): reservation e-mail engine — one shared implementation
 * for: Settings test send, manual send (rezerv "EMAIL GÖNDƏR"), AUTO-CONFIRM
 * on create, and the daily AUTO-REMINDER cron.
 *
 * Owner rule: "max dərəcədə adam üçün sadece 1 şey yazıb bütün rezervlər
 * düşsün ora" →
 *   - guest e-mail YOXSA → mail business e-mail-ə düşür (operasiya görü)
 *   - provider preset (Gmail/Brevo/Resend/Postmark) → operator yalnız
 *     1 API key (pass) + from yazır; host/user avtomatik
 */
import nodemailer from 'nodemailer';

export type ResvEmailTemplate = 'test' | 'confirm' | 'remind';

export interface EmailCfg {
  from: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  enabled: boolean;
  provider?: string;
}

export interface SendResult {
  sent: boolean;
  to: string;
  error?: string;
  code?: 'smtp_not_configured' | 'email_disabled' | 'no_recipient';
}

export async function loadEmailCfg(): Promise<{ cfg: EmailCfg; restaurant: string; fallback: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const s = await fetch(`${url}/rest/v1/settings?select=email_settings,restaurant_name,contact_email&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows = await s.json().catch(() => []);
  const row = rows?.[0] || {};
  const e = row.email_settings || {};
  return {
    cfg: {
      from: e.from || row.contact_email || '',
      host: e.host || '',
      port: Number(e.port) || 587,
      user: e.user || '',
      pass: e.pass || '',
      enabled: e.enabled !== false,
      provider: e.provider || 'custom',
    },
    restaurant: row.restaurant_name || 'Saito',
    fallback: row.contact_email || '',
  };
}

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

/**
 * Send a reservation e-mail. Non-throwing: returns SendResult (caller can
 * fire-and-forget). Logs every attempt to email_logs (service role).
 */
export async function sendReservationEmail(opts: {
  to: string | null;
  template: ResvEmailTemplate;
  reservation?: any;
  reservation_id?: string | null;
}): Promise<SendResult> {
  const { to: toRaw, template, reservation, reservation_id } = opts;
  let { cfg, restaurant, fallback } = await loadEmailCfg().catch(() => ({ cfg: { from: '', host: '', port: 587, user: '', pass: '', enabled: false } as EmailCfg, restaurant: 'Saito', fallback: '' }));

  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { sent: false, to: toRaw || '', code: 'smtp_not_configured', error: 'SMTP ayarları yoxdur' };
  }
  if (!cfg.enabled) {
    return { sent: false, to: toRaw || '', code: 'email_disabled', error: 'Email sönükdür' };
  }

  // Owner rule: no guest e-mail → business e-mail receives it (1 şey yaz,
  // bütün rezervlər ora düşsün).
  let to = (toRaw || '').trim();
  if (!to) to = cfg.from || fallback;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, to, code: 'no_recipient', error: 'Göndəriş ünvanı yoxdur (qonaq + business mail boşdur)' };
  }

  const vars = reservation || {};
  let subject: string;
  let inner: string;
  if (template === 'test') {
    subject = `SAITO — test maili`;
    inner = `<p style="font-size:16px;font-weight:800;">SMTP bağlantısı uğurludur ✓</p>
             <p style="color:rgba(255,255,255,0.55);font-size:12px;">Bu test maili ${esc(cfg.from)} ünvanından göndərildi.</p>`;
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

  const port = cfg.port || 587;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port,
    secure: port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  let error: string | null = null;
  try {
    await transporter.sendMail({
      from: `"${restaurant}" <${cfg.from}>`,
      to,
      subject,
      html: layout(restaurant, inner),
    });
  } catch (e: any) {
    error = e?.message || 'send failed';
  }

  // audit (best-effort)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (url && key) {
    fetch(`${url}/rest/v1/email_logs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        to_addr: to,
        template,
        reservation_id: reservation_id || reservation?.id || null,
        status: error ? 'failed' : 'sent',
        error,
        meta: { from: cfg.from, restaurant },
      }),
    }).catch(() => { /* audit is best-effort */ });
  }

  // persist guest e-mail onto the reservation (one-tap next time)
  if (!error && template !== 'test' && reservation_id && toRaw) {
    fetch(`${url}/rest/v1/reservations?id=eq.${encodeURIComponent(reservation_id)}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email: to }),
    }).catch(() => { /* best-effort */ });
  }

  return { sent: !error, to, error: error || undefined };
}
