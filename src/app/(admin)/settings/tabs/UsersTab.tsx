'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Eye, EyeOff, ShieldCheck, ChefHat, UserCog, X, KeyRound, Mail, Server, Send, LayoutDashboard, ShoppingCart, Package, Megaphone, BarChart2, Settings, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type AdminRole = 'superadmin' | 'admin' | 'kitchen';
type AdminUser = { id: string; email: string; role: AdminRole; is_active: boolean; created_at: string };

const ROLE_CONFIG: Record<AdminRole, { label: string; icon: React.ReactNode; color: string }> = {
  superadmin: { label: 'Superadmin', icon: <ShieldCheck size={11} />, color: 'text-gold bg-gold/10 border-gold/25' },
  admin:      { label: 'Admin',      icon: <UserCog size={11} />,     color: 'text-blue-400 bg-blue-400/10 border-blue-400/25' },
  kitchen:    { label: 'Mətbəx',    icon: <ChefHat size={11} />,     color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25' },
};

const ALL_TABS = [
  { key: 'dashboard',     label: 'Dashboard',    icon: <LayoutDashboard size={12} /> },
  { key: 'orders',        label: 'Sifarişlər',   icon: <ShoppingCart size={12} /> },
  { key: 'products',      label: 'Məhsullar',    icon: <Package size={12} /> },
  { key: 'campaigns',     label: 'Kampaniyalar', icon: <Megaphone size={12} /> },
  { key: 'stats',         label: 'Statistika',   icon: <BarChart2 size={12} /> },
  { key: 'settings',      label: 'Ayarlar',      icon: <Settings size={12} /> },
] as const;

type TabKey = typeof ALL_TABS[number]['key'];

const emptyForm = () => ({ email: '', password: '', role: 'admin' as AdminRole, permissions: ['dashboard','orders','products','campaigns','stats'] as TabKey[] });

// step: 'form' → 'code' → done
type CreateStep = 'form' | 'code';

const UsersTab = ({ role }: { role?: string | null }) => {
  const { t } = useLanguage();
  const isSuperadmin = role === 'superadmin';

  // SMTP state
  const [smtp, setSmtp] = useState({ smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: '', smtp_pass: '', smtp_from_name: 'Saito Admin' });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm());
  const [showPw, setShowPw]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Verification flow
  const [formPerms, setFormPerms] = useState<TabKey[]>(['dashboard','orders','products','campaigns','stats']);
  const [createStep, setCreateStep] = useState<CreateStep>('form');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Change password state
  const [changingId, setChangingId]   = useState<string | null>(null);
  const [currentPw, setCurrentPw]     = useState('');
  const [newPw, setNewPw]             = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw]     = useState(false);
  const [changingPw, setChangingPw]   = useState(false);

  useEffect(() => {
    if (!isSuperadmin) return;
    setSmtpLoading(true);
    fetch('/api/auth/smtp').then(r => r.json()).then(d => { if (d && !d.error) setSmtp(d); }).finally(() => setSmtpLoading(false));
  }, [isSuperadmin]);

  const saveSmtp = async () => {
    setSmtpSaving(true);
    const res = await fetch('/api/auth/smtp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(smtp) });
    const d = await res.json();
    if (!res.ok) toast.error(d.error || 'Xəta', { id: 'action-toast' });
    else toast.success(t('smtp_saved'), { id: 'action-toast' });
    setSmtpSaving(false);
  };

  const sendTestEmail = async () => {
    if (!testEmail) { toast.error(t('smtp_test_email_required'), { id: 'action-toast' }); return; }
    setTestSending(true);
    const res = await fetch('/api/auth/smtp-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toEmail: testEmail }) });
    const d = await res.json();
    if (!res.ok) toast.error(d.error || t('smtp_test_failed'), { id: 'action-toast' });
    else toast.success(t('smtp_test_sent'), { id: 'action-toast' });
    setTestSending(false);
  };

  const fetchUsers = async () => {
    const res = await fetch('/api/auth/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const togglePerm = (key: TabKey) => {
    setFormPerms(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password.trim()) { toast.error(t('users_email_password_required'), { id: 'action-toast' }); return; }
    if (form.password.length < 6) { toast.error(t('users_password_min_6'), { id: 'action-toast' }); return; }
    setSendingCode(true);
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.trim().toLowerCase() }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || t('users_code_send_error'), { id: 'action-toast' }); }
    else {
      toast.success(t('users_code_sent').replace('{email}', form.email), { id: 'action-toast', duration: 4000 });
      setCreateStep('code');
      setVerifyCode('');
    }
    setSendingCode(false);
  };

  const verifyAndCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim() || verifyCode.length !== 6) { toast.error(t('users_code_6_digits'), { id: 'action-toast' }); return; }
    setVerifying(true);
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.trim().toLowerCase(), code: verifyCode, password: form.password, userRole: form.role, permissions: form.role === 'kitchen' ? ['kitchen'] : formPerms }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || t('users_code_invalid'), { id: 'action-toast' }); }
    else {
      toast.success(t('users_account_created'), { id: 'action-toast' });
      setForm(emptyForm());
      setFormPerms(['dashboard','orders','products','campaigns','stats']);
      setShowForm(false);
      setCreateStep('form');
      fetchUsers();
    }
    setVerifying(false);
  };

  const deleteUser = async (id: string) => {
    setDeletingId(id);
    const res = await fetch(`/api/auth/users?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success(t('users_account_deleted'), { id: 'action-toast' });
    } else {
      const d = await res.json();
      toast.error(d.error || t('users_delete_error'), { id: 'action-toast' });
    }
    setDeletingId(null);
  };

  const changePassword = async (targetEmail: string) => {
    if (!newPw.trim() || newPw.length < 6) { toast.error(t('users_password_min_6'), { id: 'action-toast' }); return; }
    setChangingPw(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEmail, currentPassword: currentPw || undefined, newPassword: newPw }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Xəta baş verdi', { id: 'action-toast' }); }
    else {
      toast.success(t('users_update_password') + ' ✔', { id: 'action-toast' });
      setChangingId(null);
      setCurrentPw('');
      setNewPw('');
    }
    setChangingPw(false);
  };

  // Loading spinner removed - instant render

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-white/65 text-sm">{t('users_accounts_count').replace('{n}', String(users.length))}</p>
        <button
          onClick={() => { setShowForm(v => !v); setForm(emptyForm()); }}
          className="flex items-center gap-2 px-6 py-3 bg-gold text-black text-sm font-bold rounded-xl hover:bg-white transition-all shadow-lg shadow-gold/10"
        >
          <Plus size={15} /> {t('users_new_account')}
        </button>
      </div>

      {/* Create form — Step 1: fill details */}
      {showForm && createStep === 'form' && (
          <form
            onSubmit={sendCode}
            className="rounded-2xl bg-gradient-to-b from-white/[0.05] to-transparent border border-white/[0.1] p-6 space-y-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/55 font-semibold block">{t('users_email')}</label>
                <input type="email" autoComplete="off" placeholder="admin@saito.az"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-gold/60 px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none rounded-xl transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/55 font-semibold block">{t('users_password')}</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="min. 6 simvol"
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-gold/60 px-4 py-2.5 pr-10 text-sm text-white placeholder:text-white/20 outline-none rounded-xl transition-all" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/55 font-semibold block">{t('users_role')}</label>
                <div className="flex gap-2">
                  {(['admin', 'kitchen'] as AdminRole[]).map(r => (
                    <button key={r} type="button" onClick={() => setForm({ ...form, role: r })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        form.role === r ? ROLE_CONFIG[r].color + ' border-current' : 'text-white/30 border-white/10 hover:border-white/20'
                      }`}>
                      {ROLE_CONFIG[r].icon} {ROLE_CONFIG[r].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Permissions */}
            {form.role !== 'kitchen' && (
              <div className="space-y-2 pt-1">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/55 font-semibold block">{t('users_tab_permissions')}</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_TABS.map(tab => {
                    const active = formPerms.includes(tab.key);
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => togglePerm(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                          active
                            ? 'bg-gold/10 border-gold/30 text-gold'
                            : 'bg-white/[0.03] border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
                        }`}
                      >
                        {tab.icon} {tab.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-white/30 mt-1">{t('users_tab_permissions_hint')}</p>
              </div>
            )}
            {form.role === 'kitchen' && (
              <div className="px-3 py-2 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15">
                <p className="text-[11px] text-emerald-400/70">{t('users_kitchen_hint')}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-1 border-t border-white/[0.05]">
              <button type="button" onClick={() => { setShowForm(false); setCreateStep('form'); }}
                className="px-5 py-2.5 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-lg hover:bg-[var(--theme-surface-muted)]">
                {t('users_cancel')}
              </button>
              <button type="submit" disabled={sendingCode}
                className="flex items-center gap-2 bg-[#111111] text-white px-6 py-2.5 rounded-2xl font-bold text-sm transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-black">
                {sendingCode ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {t('users_send_code')}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: enter verification code */}
        {showForm && createStep === 'code' && (
          <form
            onSubmit={verifyAndCreate}
            className="rounded-2xl bg-gradient-to-b from-white/[0.05] to-transparent border border-gold/20 p-6 space-y-5"
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center text-gold">
                <KeyRound size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t('users_verify_title')}</p>
                <p className="text-[11px] text-white/55">{t('users_verify_hint').replace('{email}', form.email)}</p>
              </div>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="_ _ _ _ _ _"
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              className="w-full bg-white/[0.04] border border-gold/30 focus:border-gold/70 px-4 py-3 text-2xl font-mono font-bold text-gold text-center tracking-[0.5em] placeholder:text-white/15 outline-none rounded-xl transition-all"
            />
            <div className="flex justify-between gap-3 pt-1 border-t border-white/[0.05]">
              <button type="button" onClick={() => setCreateStep('form')}
                className="px-5 py-2.5 text-sm text-white/30 hover:text-white/70 transition-colors rounded-lg hover:bg-white/5">
                {t('users_back')}
              </button>
              <button type="submit" disabled={verifying || verifyCode.length !== 6}
                className="flex items-center gap-2 bg-[#111111] text-white px-6 py-2.5 rounded-2xl font-bold text-sm transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-black">
                {verifying ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                {t('users_create')}
              </button>
            </div>
          </form>
        )}

      {/* User list */}
      {users.length === 0 ? (
        <div className="text-center py-16 text-white/20">
          <UserCog size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm uppercase tracking-widest">{t('users_no_accounts')}</p>
        </div>
      ) : (
        <div className="bg-card border border-white/5 rounded-2xl divide-y divide-white/5">
          {users.map(u => {
            const cfg = ROLE_CONFIG[u.role];
            return (
              <React.Fragment key={u.id}>
                <div className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.email}</p>
                    <p className="text-[10px] text-white/50 mt-0.5">
                      {new Date(u.created_at).toLocaleDateString('az-AZ')}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      title={t('users_password')}
                      onClick={() => { setChangingId(changingId === u.id ? null : u.id); setCurrentPw(''); setNewPw(''); }}
                      className="w-10 h-10 rounded-xl text-white/25 flex items-center justify-center transition-all"
                    >
                      {changingId === u.id ? <X size={15} /> : <KeyRound size={15} />}
                    </button>
                    <button
                      title={t('users_delete')}
                      onClick={() => deleteUser(u.id)}
                      disabled={deletingId === u.id}
                      className="w-10 h-10 rounded-xl hover:bg-red-500/10 text-white/20 hover:text-red-400 flex items-center justify-center transition-all disabled:opacity-40"
                    >
                      {deletingId === u.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>

                {/* Inline password change */}
                  {changingId === u.id && (
                    <div className="px-6 pb-4">
                      <div className="flex flex-col gap-2 mt-1">
                        <div className="flex gap-2">
                          {/* Current password */}
                          <div className="relative flex-1">
                            <input
                              type={showCurrentPw ? 'text' : 'password'}
                              placeholder={t('users_current_password_placeholder')}
                              value={currentPw}
                              onChange={e => setCurrentPw(e.target.value)}
                              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-white/30 px-3 py-2.5 pr-9 text-sm text-white placeholder:text-white/20 outline-none rounded-xl transition-all"
                            />
                            <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                              {showCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          {/* New password */}
                          <div className="relative flex-1">
                            <input
                              type={showNewPw ? 'text' : 'password'}
                              placeholder={t('users_new_password_placeholder')}
                              value={newPw}
                              onChange={e => setNewPw(e.target.value)}
                              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-gold/50 px-3 py-2.5 pr-9 text-sm text-white placeholder:text-white/20 outline-none rounded-xl transition-all"
                            />
                            <button type="button" onClick={() => setShowNewPw(v => !v)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                              {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          <button
                            onClick={() => changePassword(u.email)}
                            disabled={changingPw || !newPw}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gold/90 text-black text-sm font-bold rounded-xl transition-all disabled:opacity-40 shrink-0"
                          >
                            {changingPw ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                            {t('users_update_password')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {/* SMTP Settings — superadmin only */}
      {isSuperadmin && (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          {/* Collapsed header / toggle */}
          <button
            type="button"
            onClick={() => setSmtpOpen(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
              <Server size={13} className="text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{t('smtp_section_title')}</p>
              <p className="text-[11px] text-white/40">{t('smtp_section_desc')}</p>
            </div>
            {smtp.smtp_user && (
              <span className="text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">{t('users_configured')}</span>
            )}
            <ChevronDown size={14} className={`text-white/30 flex-shrink-0 transition-transform duration-200 ${smtpOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Expandable body */}
            {smtpOpen && (
              <div>
                <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-4">
                  {smtpLoading ? (
                    <div className="h-8 flex items-center"><Loader2 size={16} className="animate-spin text-white/30" /></div>
                  ) : (
                    <>
                      {!smtp.smtp_user && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 space-y-1.5">
                          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">{t('smtp_not_configured')}</p>
                          <p className="text-[11px] font-semibold text-white/60">{t('smtp_hint_title')}</p>
                          <ul className="space-y-0.5">
                            {(['smtp_hint_step1','smtp_hint_step2','smtp_hint_step3','smtp_hint_step4'] as const).map(k => (
                              <li key={k} className="text-[11px] text-white/55 leading-relaxed">{t(k)}</li>
                            ))}
                          </ul>
                          <p className="text-[11px] text-amber-400/70 font-medium">↓ {t('smtp_hint_cta')}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-semibold block">{t('smtp_user')}</label>
                          <input type="email" value={smtp.smtp_user} onChange={e => setSmtp(s => ({ ...s, smtp_user: e.target.value }))}
                            placeholder="gmail@gmail.com"
                            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-gold/50 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none rounded-xl transition-all" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-semibold block">{t('smtp_pass')}</label>
                          <div className="relative">
                            <input type={showSmtpPass ? 'text' : 'password'} value={smtp.smtp_pass} onChange={e => setSmtp(s => ({ ...s, smtp_pass: e.target.value }))}
                              placeholder="xxxxxxxxxxxxxxxxxxxx"
                              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-gold/50 px-3 py-2 pr-9 text-sm text-white placeholder:text-white/20 outline-none rounded-xl transition-all" />
                            <button type="button" onClick={() => setShowSmtpPass(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                              {showSmtpPass ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                        </div>
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-semibold block">{t('smtp_from_name')}</label>
                          <input value={smtp.smtp_from_name} onChange={e => setSmtp(s => ({ ...s, smtp_from_name: e.target.value }))}
                            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-gold/50 px-3 py-2 text-sm text-white outline-none rounded-xl transition-all" />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.05]">
                    <input value={testEmail} onChange={e => setTestEmail(e.target.value)} type="email" placeholder="test@gmail.com"
                      className="flex-1 min-w-[160px] bg-white/[0.04] border border-white/[0.08] focus:border-white/25 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none rounded-xl transition-all" />
                    <button onClick={sendTestEmail} disabled={testSending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 text-xs font-semibold transition-all disabled:opacity-40">
                      {testSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {t('smtp_test')}
                    </button>
                    <button onClick={saveSmtp} disabled={smtpSaving}
                      className="flex items-center gap-1.5 px-5 py-2 bg-gold/90 text-black text-sm font-bold rounded-xl transition-all disabled:opacity-40">
                      {smtpSaving ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} {t('smtp_save')}
                    </button>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default UsersTab;
