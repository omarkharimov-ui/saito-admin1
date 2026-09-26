'use client';

// 2026-09-25 (owner): "sms provider settings sehifesinde lazim olan taba hazir
// veziyyetde saxla — o zleri connect edib islederler eger lazim olsa".
// Ready-state SMS config: pick a provider, paste credentials, save. NOTHING
// sends until someone flips the enable switch — and even then the actual
// provider call is the next small step. No secrets are shown back (masked).
import { useState, useEffect } from 'react';
import { BellRing, Loader2, Save, Send, Mail } from 'lucide-react';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type SmsState = {
  provider?: string;
  sender?: string;
  sid?: string;
  token?: string;
  enabled?: boolean;
  updated_at?: string;
};

// 2026-09-26 (owner): e-mail infra ready-state — same pattern as SMS:
// fill business e-mail + SMTP, save, flip enable, test button sends a real
// test e-mail via /api/email/send. Password is masked, never returned.
type EmailState = {
  from?: string;
  host?: string;
  port?: number;
  user?: string;
  enabled?: boolean;
  has_password?: boolean;
  updated_at?: string;
};

const PROVIDERS = [
  { id: 'twilio', name: 'Twilio', hint: 'Account SID + Auth Token' },
  { id: 'whatsapp_business', name: 'WhatsApp Business API', hint: 'Phone number ID + Token' },
  { id: 'local', name: 'Yerli provayder (Bakı)', hint: 'API URL + Key' },
];

export default function NotificationsTab() {
  const { t } = useLanguage();
  const [sms, setSms] = useState<SmsState>({});
  const [form, setForm] = useState({ provider: 'twilio', sender: '', sid: '', token: '', enabled: false });
  const [email, setEmail] = useState<EmailState>({});
  const [emailForm, setEmailForm] = useState({ from: '', host: '', port: 587, user: '', pass: '', enabled: false, provider: 'gmail' });
  // 2026-09-26 (owner: "sadece 1 şey yazıb bütün rezervlər düşsün"):
  // provider preset → host/user avtomatik; operator yalnız KEY (pass) + from.
  const EMAIL_PRESETS: Record<string, { host: string; port: number; user: string; keyLabel: string }> = {
    gmail: { host: 'smtp.gmail.com', port: 587, user: 'info@saito.az', keyLabel: 'App Password (Google → Security → App passwords)' },
    brevo: { host: 'smtp-relay.brevo.com', port: 587, user: 'default', keyLabel: 'Brevo API key (xərcsiz 300 mail/gün)' },
    resend: { host: 'smtp.resend.com', port: 587, user: 'resend', keyLabel: 'Resend API key (xərcsiz 100 mail/gün)' },
    postmark: { host: 'smtp.postmarkapp.com', port: 587, user: 'user', keyLabel: 'Postmark server token' },
    custom: { host: '', port: 587, user: '', keyLabel: 'SMTP parol' },
  };
  const EMAIL_HINTS: Record<string, string> = {
    gmail: 'Google hesabı → Təhlükəsizlik → 2 Addımlı Doğrulama → "App parolları (App passwords)" → 16 simvolluq kodu buraya yapışdırın.',
    brevo: 'Xərcsiz 300 mail/gün. brevo.com → Transactional → SMTP & API → Keys → yeni key yaradın.',
    resend: 'Xərcsiz 100 mail/gün. resend.com → API Keys → Create new key.',
    postmark: 'postmarkapp.com → Servers → server seç → "Server token".',
    custom: 'Öz SMTP serveriniz üçün host / port / user "İlərk" sahəsində açılır.',
  };
  const applyPreset = (id: string) => {
    const p = EMAIL_PRESETS[id] || EMAIL_PRESETS.custom;
    setEmailForm(f => ({
      ...f,
      provider: id,
      host: id === 'custom' ? f.host : p.host,
      port: p.port,
      user: id === 'custom' ? f.user : p.user,
    }));
  };
  const [contactEmail, setContactEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/partners');
        if (res.ok) {
          const data = await res.json();
          const s: SmsState = data.sms || {};
          setSms(s);
          setForm({
            provider: s.provider || 'twilio',
            sender: s.sender || '',
            sid: s.sid || '',
            token: s.token ? '••••••••' : '',
            enabled: !!s.enabled,
          });
          const e: EmailState = data.email || {};
          setEmail(e);
          setContactEmail(data.contact_email || '');
          setEmailForm({
            from: e.from || data.contact_email || '',
            host: e.host || EMAIL_PRESETS[(e as any).provider || 'gmail'].host,
            port: e.port || 587,
            user: e.user || '',
            pass: e.has_password ? '••••••••' : '',
            // 2026-09-27 (owner 1-addım UX): config tamam olanda DEFOLT AKTİV
            enabled: e.enabled ?? true,
            provider: (e as any).provider || (e.host ? 'custom' : 'gmail'),
          });
        }
      } catch { /* offline */ }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sms: {
            provider: form.provider,
            sender: form.sender || null,
            sid: form.sid || null,
            // keep the old token if the user didn't type a new one
            token: form.token && !form.token.startsWith('•') ? form.token : undefined,
            enabled: form.enabled,
          },
        }),
      });
      if (res.ok) {
        toast.success('Bildiriş ayarları saxlanıldı');
        setForm(f => ({ ...f, token: '••••••••' }));
      } else {
        toast.error((await res.json()).error || 'Saxlanmadı');
      }
    } catch {
      toast.error('Ağ şəbəkəsi yoxdur');
    } finally { setSaving(false); }
  };

  // 2026-09-26 (owner): e-mail save + real test send.
  const saveEmail = async () => {
    setSavingEmail(true);
    try {
      const res = await apiFetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: {
            from: emailForm.from || null,
            host: emailForm.host || null,
            port: emailForm.port || 587,
            user: emailForm.user || null,
            provider: emailForm.provider,
            // masked placeholder = keep the stored password
            pass: emailForm.pass && !emailForm.pass.startsWith('•') ? emailForm.pass : undefined,
            enabled: emailForm.enabled,
          },
        }),
      });
      if (res.ok) {
        toast.success('Email ayarları saxlanıldı');
        setEmailForm(f => ({ ...f, pass: '••••••••' }));
        setEmail(e => ({ ...e, has_password: true }));
      } else {
        toast.error((await res.json()).error || 'Saxlanmadı');
      }
    } catch {
      toast.error('Ağ şəbəkəsi yoxdur');
    } finally { setSavingEmail(false); }
  };

  const testEmail = async () => {
    if (!emailForm.from) {
      toast.error('Əvvəl business e-mail ünvanını yazın');
      return;
    }
    setTesting(true);
    try {
      const res = await apiFetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailForm.from, template: 'test' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Test maili ${emailForm.from}-a göndərildi ✓`);
      } else if (data.error === 'smtp_not_configured') {
        toast.error('Əvvəl SMTP ayarlarını saxlayın');
      } else if (data.error === 'email_disabled') {
        toast.error('Email aktiv deyil — toggle-ı açın və saxlayın');
      } else {
        toast.error(data.error || 'Göndəriş uğursuz oldu');
      }
    } catch {
      toast.error('Ağ şəbəkəsi yoxdur');
    } finally { setTesting(false); }
  };

  const hasCreds = !!(sms.sid || (sms.token && form.token === '••••••••'));
  const emailConfigured = !!(email.host && email.user && email.has_password && email.from);

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/40" /></div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-start gap-3">
        <BellRing size={16} className="text-sky-400 mt-0.5 shrink-0" />
        <p className="text-[12px] text-white/50 leading-relaxed">
          {t('sms_hint') || 'Bu tab HAZIR vəziyyətdədir: provider seç, hesab məlumatlarını yaz, saxla. Enable açıldıqda rezervasiya təsdiqi, 24s ixtisar və waitlist bildirişləri bu kanaldan gedəcək. Toggle açılmayana qədər heç bir şey göndərilmir.'}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 p-5 space-y-4">
        {/* Provider */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Provider</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PROVIDERS.map(p => (
              <button key={p.id} type="button" onClick={() => setForm(f => ({ ...f, provider: p.id }))}
                className={`rounded-xl border p-3 text-left transition-all ${form.provider === p.id ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
                <span className={`block text-[12px] font-bold ${form.provider === p.id ? 'text-sky-300' : 'text-white/80'}`}>{p.name}</span>
                <span className="block text-[10px] text-white/35 mt-0.5">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sender */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Göndərən nömrə / SID</label>
          <input value={form.sender} onChange={e => setForm(f => ({ ...f, sender: e.target.value }))} placeholder="+994 50 000 00 00"
            className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-sky-400/60" />
        </div>

        {/* API credentials */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">API SID / URL</label>
            <input value={form.sid} onChange={e => setForm(f => ({ ...f, sid: e.target.value }))} placeholder="SK…"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-sky-400/60" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">API Token / Key</label>
            <input type="password" value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} placeholder="yeni token yaz"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-sky-400/60" />
          </div>
        </div>

        {/* Templates preview (read-only, ready state) */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Şablonlar (göndəriləndə)</label>
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 space-y-1.5">
            <p className="text-[11px] text-white/45">{'• Rezervasiya təsdiqi: "Salam {ad}, rezervasiyanız {tarix} {saat} üçün təsdiqlənib."'}</p>
            <p className="text-[11px] text-white/45">{'• 24s ixtisar: "Salam {ad}, yarın {saat} rezervasiyanız xatırladır."'}</p>
            <p className="text-[11px] text-white/45">{'• Waitlist: "{ad}, masa hazırdır — {nömrə}."'}</p>
          </div>
        </div>

        {/* Enable + save */}
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
            className="flex items-center gap-2.5 text-[12px] font-semibold text-white/70">
            <span className={`relative h-6 w-11 rounded-full transition-colors ${form.enabled ? 'bg-sky-500' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${form.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
            {form.enabled ? 'Aktivdir' : 'Sönükdür'}
          </button>
          <div className="flex items-center gap-2">
            {form.enabled && !hasCreds && (
              <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wide">Creds lazımdır</span>
            )}
            <button type="button" onClick={save} disabled={saving || (form.enabled && !hasCreds)}
              className="h-9 px-4 rounded-xl bg-sky-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sky-400 transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Saxla
            </button>
          </div>
        </div>
      </div>

      {/* 2026-09-27 (owner: "whatsapp settings kimi gözəl, hint'li, min input"):
          3-addımlı guid dizayn — provider seç → 2 sahə (email + key) → Test.
          Host/port/user avtomatik (yalnız Custom-da görünür). */}
      <div className="rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
            <Mail size={15} className="text-emerald-400" />
          </span>
          <div>
            <h4 className="text-[12px] font-black uppercase tracking-widest text-white/80">E-mail</h4>
            <p className="text-[10px] text-white/35">Rezerv təsdiqi + xatırlatma — avtomatik</p>
          </div>
          {(() => {
            const hasKey = email.has_password || (!!emailForm.pass && !emailForm.pass.startsWith('•'));
            const hasFrom = !!emailForm.from.trim();
            const done = hasKey && hasFrom;
            return done
              ? <span className="ml-auto px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">Hazırdır</span>
              : <span className="ml-auto px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  Qalan: {[!hasFrom && 'e-mail', !hasKey && 'key'].filter(Boolean).join(' + ')}
                </span>;
          })()}
        </div>

        {/* nə edir — user heç düşünmədən anlasın */}
        <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 px-3.5 py-2.5 space-y-1">
          <p className="text-[11px] text-white/60 leading-relaxed">
            <span className="text-emerald-400 font-bold">Avtomatik işləyəcək:</span> yeni rezerv → <b>təsdiq maili</b> anında · bugünkü+sabahki rezervlər → <b>xatırlatma</b> 09:00 + 16:00 · qonağın e-mail-i yoxdursa → <b>business mail-ə</b> düşür.
          </p>
        </div>

        {/* ADDIM 1 — provider */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
            1 · Provider seç
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {([['gmail', 'Gmail'], ['brevo', 'Brevo'], ['resend', 'Resend'], ['postmark', 'Postmark'], ['custom', 'Öz SMTP']] as const).map(
              ([id, label]) => (
                <button key={id} type="button" onClick={() => applyPreset(id)}
                  className={`h-9 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-colors ${
                    emailForm.provider === id
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                      : 'bg-white/[0.03] border-white/10 text-white/45 hover:bg-white/[0.06]'
                  }`}>
                  {label}
                </button>
              )
            )}
          </div>
          {/* kontekstual hint — seçilən provider-in key-ini necə alacağını */}
          <div className="mt-2 rounded-xl bg-white/[0.03] border border-white/8 px-3.5 py-2.5">
            <p className="text-[11px] text-white/50 leading-relaxed">
              <span className="text-white/70 font-bold">Key necə alınır: </span>
              {EMAIL_HINTS[emailForm.provider] || EMAIL_HINTS.custom}
            </p>
            {emailForm.provider !== 'custom' && (
              <p className="text-[10px] text-white/30 mt-1">
                SMTP avtomatik: <span className="font-mono text-white/45">{emailForm.host}:{emailForm.port}</span> · user: <span className="font-mono text-white/45">{emailForm.user || 'auto'}</span>
              </p>
            )}
          </div>
        </div>

        {/* ADDIM 2 — cəmi 2 sahə (custom-da +3 ilərk) */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
            2 · Business e-mail + key
          </label>
          <div className="space-y-2.5">
            <input value={emailForm.from} onChange={e => setEmailForm(f => ({ ...f, from: e.target.value }))} placeholder="info@saito.az — mail-lər bu ünvan adından gedir"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60" />
            <input type="password" value={emailForm.pass} onChange={e => setEmailForm(f => ({ ...f, pass: e.target.value }))}
              placeholder={email.has_password ? 'Key saxlanılıb (yenisini yazıb dəyiş)' : (EMAIL_PRESETS[emailForm.provider]?.keyLabel || 'SMTP parol')}
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60" />
            {contactEmail && emailForm.from !== contactEmail && (
              <button type="button" onClick={() => setEmailForm(f => ({ ...f, from: contactEmail }))}
                className="text-[10px] text-emerald-400/80 hover:text-emerald-300 font-semibold">
                ⚡ Settings-dəki ümumi e-maili istifadə et: {contactEmail}
              </button>
            )}
          </div>
          {emailForm.provider === 'custom' && (
            <details className="mt-2.5">
              <summary className="text-[10px] font-black uppercase tracking-widest text-white/40 cursor-pointer select-none">
                İlərk: öz SMTP (host / port / user)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
                <input value={emailForm.host} onChange={e => setEmailForm(f => ({ ...f, host: e.target.value }))} placeholder="smtp.mysite.com"
                  className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60 sm:col-span-2" />
                <input type="number" value={emailForm.port} onChange={e => setEmailForm(f => ({ ...f, port: Number(e.target.value) || 587 }))} placeholder="587"
                  className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white focus:outline-none focus:border-emerald-400/60" />
                <input value={emailForm.user} onChange={e => setEmailForm(f => ({ ...f, user: e.target.value }))} placeholder="SMTP user"
                  className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60 sm:col-span-3" />
              </div>
            </details>
          )}
        </div>

        {/* ADDIM 3 — test + saxla */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
            3 · Test et → Saxla
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={testEmail} disabled={testing || !emailForm.from}
              className="flex-1 h-10 rounded-xl border border-emerald-400/40 text-emerald-300 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-emerald-400/10 transition-colors">
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Test maili göndər
            </button>
            <button type="button" onClick={saveEmail} disabled={savingEmail}
              className="flex-1 h-10 rounded-xl bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-emerald-400 transition-colors">
              {savingEmail ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Saxla
            </button>
          </div>
          <p className="text-[10px] text-white/30 mt-1.5">
            Test = bu kartdakı business e-mailə real mail gedir. Saxladıqdan sonra avtomatik rejim başlayır.
          </p>
        </div>

        {/* şablon preview — fold edilib (səs-sessiz işləyir, amma user görür) */}
        <details className="rounded-xl bg-white/[0.03] border border-white/5 px-3.5 py-2.5">
          <summary className="text-[10px] font-black uppercase tracking-widest text-white/40 cursor-pointer select-none">
            Mail-nin görünüşü (preview)
          </summary>
          <div className="mt-2 space-y-1.5">
            <p className="text-[11px] text-white/45">{'Təsdiq: "Salam {ad}, rezervasiyanız {tarix} {saat} üçün təsdiqlənib" — ★VIP + Depozit çipi daxil'}</p>
            <p className="text-[11px] text-white/45">{'Xatırlatma: "Salam {ad}, xatırladırıq: {tarix} {saat} rezervasiyanız"'}</p>
            <p className="text-[11px] text-white/45">Rezerv səhifəsində ayrıca <b>"EMAIL GÖNDƏR"</b> buttonu — istənilən vaxt əl ilə.</p>
          </div>
        </details>
      </div>

      <p className="text-[10px] text-white/25 flex items-center gap-1.5">
        <Send size={10} />
        {t('sms_note') || 'Qeyd: token DB-də saxlanılır, interfeysdə masklanır. Provider inteqrasiyası (həqiqi göndəriş) key bağlandıqda aktivləşir.'}
      </p>
    </div>
  );
}
