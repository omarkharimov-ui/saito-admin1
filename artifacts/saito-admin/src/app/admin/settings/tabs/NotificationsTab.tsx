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
  const [emailForm, setEmailForm] = useState({ from: '', host: '', port: 587, user: '', pass: '', enabled: false });
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
            host: e.host || '',
            port: e.port || 587,
            user: e.user || '',
            pass: e.has_password ? '••••••••' : '',
            enabled: !!e.enabled,
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

      {/* 2026-09-26 (owner): EMAIL card — business e-mail + SMTP + test send.
          Rezerv səhifəsindəki "EMAIL GÖNDƏR" buttonları bu konfiqurasiyanı
          istifadə edir (confirm/reminder şablonları). */}
      <div className="rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
            <Mail size={15} className="text-emerald-400" />
          </span>
          <div>
            <h4 className="text-[12px] font-black uppercase tracking-widest text-white/80">E-mail</h4>
            <p className="text-[10px] text-white/35">Rezervasiya təsdiqi + xatırlatma — SMTP ilə</p>
          </div>
          {emailConfigured
            ? <span className="ml-auto px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">Hazırdır</span>
            : <span className="ml-auto px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white/35">Konfiqurasiya lazımdır</span>}
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Business e-mail (göndərən)</label>
          <input value={emailForm.from} onChange={e => setEmailForm(f => ({ ...f, from: e.target.value }))} placeholder="info@saito.az"
            className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60" />
          {contactEmail && emailForm.from !== contactEmail && (
            <p className="text-[10px] text-white/30 mt-1">Settings-dəki ümumi e-mail: {contactEmail}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">SMTP Host</label>
            <input value={emailForm.host} onChange={e => setEmailForm(f => ({ ...f, host: e.target.value }))} placeholder="smtp.gmail.com"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Port</label>
            <input type="number" value={emailForm.port} onChange={e => setEmailForm(f => ({ ...f, port: Number(e.target.value) || 587 }))}
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white focus:outline-none focus:border-emerald-400/60" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">SMTP User</label>
            <input value={emailForm.user} onChange={e => setEmailForm(f => ({ ...f, user: e.target.value }))} placeholder="info@saito.az"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">SMTP Parol</label>
            <input type="password" value={emailForm.pass} onChange={e => setEmailForm(f => ({ ...f, pass: e.target.value }))} placeholder={email.has_password ? 'mövcuddur (dəyişmə)' : 'parol'}
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/60" />
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 space-y-1.5">
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Şablonlar (rezerv səhifəsindən göndərilir)</label>
          <p className="text-[11px] text-white/45">{'• Təsdiq: "Salam {ad}, rezervasiyanız {tarix} {saat} üçün təsdiqlənib." ★VIP + Depozit çipi daxil'}</p>
          <p className="text-[11px] text-white/45">{'• Xatırlatma: "Salam {ad}, xatırladırıq: {tarix} {saat} rezervasiyanız." '}</p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={() => setEmailForm(f => ({ ...f, enabled: !f.enabled }))}
            className="flex items-center gap-2.5 text-[12px] font-semibold text-white/70">
            <span className={`relative h-6 w-11 rounded-full transition-colors ${emailForm.enabled ? 'bg-emerald-500' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${emailForm.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
            {emailForm.enabled ? 'Aktivdir' : 'Sönükdür'}
          </button>
          <div className="flex items-center gap-2">
            {emailForm.enabled && !emailConfigured && (
              <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wide">SMTP lazımdır</span>
            )}
            <button type="button" onClick={testEmail} disabled={testing || !emailForm.from}
              className="h-9 px-4 rounded-xl border border-emerald-400/40 text-emerald-300 text-[11px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 hover:bg-emerald-400/10 transition-colors">
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Test
            </button>
            <button type="button" onClick={saveEmail} disabled={savingEmail}
              className="h-9 px-4 rounded-xl bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 hover:bg-emerald-400 transition-colors">
              {savingEmail ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Saxla
            </button>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-white/25 flex items-center gap-1.5">
        <Send size={10} />
        {t('sms_note') || 'Qeyd: token DB-də saxlanılır, interfeysdə masklanır. Provider inteqrasiyası (həqiqi göndəriş) key bağlandıqda aktivləşir.'}
      </p>
    </div>
  );
}
