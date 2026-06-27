'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, ShieldCheck, ChefHat, UserCog, KeyRound, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type AdminRole = 'superadmin' | 'admin' | 'kitchen' | 'cashier';
type AdminUser = { id: string; role: AdminRole; is_active: boolean; created_at: string };

const ROLE_CONFIG: Record<AdminRole, { label: string; icon: React.ReactNode; color: string }> = {
  superadmin: { label: 'Superadmin', icon: <ShieldCheck size={11} />, color: 'text-gold bg-gold/10 border-gold/25' },
  admin:      { label: 'Admin',      icon: <UserCog size={11} />,     color: 'text-blue-400 bg-blue-400/10 border-blue-400/25' },
  kitchen:    { label: 'Mətbəx',    icon: <ChefHat size={11} />,     color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25' },
  cashier:    { label: 'Kassir',    icon: <UserCog size={11} />,     color: 'text-purple-400 bg-purple-400/10 border-purple-400/25' },
};

const UsersTab = ({ role }: { role?: string | null }) => {
  const { t } = useLanguage();
  const isSuperadmin = role === 'superadmin';

  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ role: 'admin' as AdminRole });
  const [saving, setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newPin, setNewPin]     = useState<string | null>(null);

  // Change PIN state
  const [changingId, setChangingId] = useState<string | null>(null);
  const [pinInput, setPinInput]     = useState('');
  const [changingPin, setChangingPin] = useState(false);

  const fetchUsers = async () => {
    const res = await fetch('/api/auth/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNewPin(null);
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: form.role }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Xəta baş verdi', { id: 'action-toast' });
    } else {
      setNewPin(data.pin);
      toast.success(t('users_account_created'), { id: 'action-toast' });
      fetchUsers();
    }
    setSaving(false);
  };

  const deleteUser = async (id: string) => {
    setDeletingId(id);
    const res = await fetch(`/api/auth/users?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success(t('users_account_deleted'), { id: 'action-toast' });
    } else {
      const d = await res.json();
      toast.error(d.error || 'Xəta', { id: 'action-toast' });
    }
    setDeletingId(null);
  };

  const changePin = async (userId: string) => {
    if (!/^\d{4}$/.test(pinInput)) { toast.error('PIN 4 rəqəm olmalıdır', { id: 'action-toast' }); return; }
    setChangingPin(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newPin: pinInput }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Xəta', { id: 'action-toast' }); }
    else {
      toast.success('PIN dəyişdirildi ✔', { id: 'action-toast' });
      setChangingId(null);
      setPinInput('');
    }
    setChangingPin(false);
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[var(--theme-text-secondary)] text-sm">{t('users_accounts_count').replace('{n}', String(users.length))}</p>
        <button
          onClick={() => { setShowForm(v => !v); setNewPin(null); }}
          className="flex items-center gap-2 px-6 py-3 bg-gold text-black text-sm font-bold rounded-xl hover:brightness-110 transition-all shadow-lg shadow-gold/10"
        >
          <Plus size={15} /> {t('users_new_account')}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={createUser}
          className="rounded-2xl bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] p-6 space-y-5"
        >
          {newPin ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto">
                <KeyRound size={22} className="text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">İstifadəçi yaradıldı</p>
              <div className="inline-block px-8 py-4 bg-[var(--theme-surface)] border border-gold/30 rounded-2xl">
                <p className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-1">PIN</p>
                <p className="text-4xl font-mono font-bold text-gold tracking-[0.3em]">{newPin}</p>
              </div>
              <p className="text-[11px] text-[var(--theme-text-secondary)]">Bu PIN-i istifadəçiyə çatdırın</p>
              <button
                type="button"
                onClick={() => { setShowForm(false); setNewPin(null); }}
                className="px-6 py-2.5 rounded-xl bg-[var(--theme-surface)] text-[var(--theme-text)] text-sm font-semibold hover:bg-[var(--theme-surface-hover)] transition-all"
              >
                Bağla
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold block">{t('users_role')}</label>
                <div className="flex gap-2 flex-wrap">
                  {(['admin', 'kitchen', 'cashier'] as AdminRole[]).map(r => (
                    <button key={r} type="button" onClick={() => setForm({ ...form, role: r })}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                        form.role === r ? ROLE_CONFIG[r].color + ' border-current' : 'text-[var(--theme-text-secondary)] border-[var(--theme-border)] hover:border-[var(--theme-border-strong)]'
                      }`}>
                      {ROLE_CONFIG[r].icon} {ROLE_CONFIG[r].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1 border-t border-[var(--theme-border)]">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-lg hover:bg-[var(--theme-surface-muted)]">
                  {t('users_cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 bg-[var(--theme-surface)] text-[var(--theme-text)] px-6 py-2.5 rounded-2xl font-bold text-sm transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-[var(--theme-surface-hover)]">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {t('users_create')}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* User list */}
      {users.length === 0 ? (
        <div className="text-center py-16 text-[var(--theme-text-secondary)]">
          <UserCog size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm uppercase tracking-widest">{t('users_no_accounts')}</p>
        </div>
      ) : (
        <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl divide-y divide-[var(--theme-border)]">
          {users.map(u => {
            const cfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.admin;
            return (
              <React.Fragment key={u.id}>
                <div className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--theme-text)] truncate">#{u.id.slice(0, 8)}</p>
                    <p className="text-[10px] text-[var(--theme-text-secondary)] mt-0.5">
                      {new Date(u.created_at).toLocaleDateString('az-AZ')}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      title="PIN dəyiş"
                      onClick={() => { setChangingId(changingId === u.id ? null : u.id); setPinInput(''); }}
                      className="w-10 h-10 rounded-xl text-[var(--theme-text-secondary)] flex items-center justify-center transition-all"
                    >
                      {changingId === u.id ? <X size={15} /> : <KeyRound size={15} />}
                    </button>
                    {u.role !== 'superadmin' && (
                      <button
                        title={t('users_delete')}
                        onClick={() => deleteUser(u.id)}
                        disabled={deletingId === u.id}
                        className="w-10 h-10 rounded-xl hover:bg-red-500/10 text-[var(--theme-text-secondary)] hover:text-red-400 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        {deletingId === u.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    )}
                  </div>
                </div>

                {changingId === u.id && (
                  <div className="px-6 pb-4">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold block">Yeni PIN (4 rəqəm)</label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="1234"
                          value={pinInput}
                          onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-gold/50 px-3 py-2.5 text-lg font-mono font-bold text-gold text-center tracking-[0.3em] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                        />
                      </div>
                      <button
                        onClick={() => changePin(u.id)}
                        disabled={changingPin || pinInput.length !== 4}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gold/90 text-black text-sm font-bold rounded-xl transition-all disabled:opacity-40 shrink-0"
                      >
                        {changingPin ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                        Yadda saxla
                      </button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UsersTab;
