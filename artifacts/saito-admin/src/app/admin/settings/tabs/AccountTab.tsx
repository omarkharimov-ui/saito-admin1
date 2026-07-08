'use client';

import React, { useEffect, useState } from 'react';
import { Lock, User, ChevronDown, Save, Loader2, Shield, ChefHat, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';

interface AccountItem {
  key: 'superadmin' | 'admin' | 'kitchen';
  label: string;
  icon: React.ReactNode;
  currentPassword: string;
  newPassword: string;
}

const AccountTab = () => {
  const { t } = useLanguage();
  const [role, setRole] = useState<'admin' | 'superadmin'>('admin');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

  const [accounts, setAccounts] = useState<AccountItem[]>([
    { key: 'superadmin', label: 'Superadmin', icon: <Shield size={18} />, currentPassword: '', newPassword: '' },
    { key: 'admin', label: 'Admin', icon: <User size={18} />, currentPassword: '', newPassword: '' },
    { key: 'kitchen', label: 'Mətbəx', icon: <ChefHat size={18} />, currentPassword: '', newPassword: '' },
  ]);

  useEffect(() => {
    const storedRole = localStorage.getItem('saito_admin_role') as 'admin' | 'superadmin' | null;
    if (storedRole) setRole(storedRole);
    setLoading(false);
  }, []);

  const updateAccountField = (key: string, field: 'currentPassword' | 'newPassword', value: string) => {
    setAccounts(prev => prev.map(acc => 
      acc.key === key ? { ...acc, [field]: value } : acc
    ));
  };

  const togglePasswordVisibility = (key: string, field: 'current' | 'new') => {
    setShowPassword(prev => ({ ...prev, [`${key}_${field}`]: !prev[`${key}_${field}`] }));
  };

  const savePassword = async (accountKey: 'superadmin' | 'admin' | 'kitchen') => {
    if (role !== 'superadmin') {
      toast.error(t('only_superadmin_can_change'), { id: 'action-toast' });
      return;
    }

    const account = accounts.find(a => a.key === accountKey);
    if (!account) return;

    if (!account.currentPassword || !account.newPassword) {
      toast.error('Cari və yeni şifrə tələb olunur', { id: 'action-toast' });
      return;
    }

    if (account.newPassword.length < 6) {
      toast.error(t('password_min_6_chars'), { id: 'action-toast' });
      return;
    }

    setSaving(accountKey);

    try {
      const res = await fetch('/api/auth/change-settings-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountKey,
          currentPassword: account.currentPassword,
          newPassword: account.newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Şifrə yenilənmədi', { id: 'action-toast' });
        setSaving(null);
        return;
      }

      setAccounts(prev => prev.map(acc => 
        acc.key === accountKey ? { ...acc, currentPassword: '', newPassword: '' } : acc
      ));

      toast.success(t('password_updated').replace('{account}', account.label), { id: 'action-toast', duration: 3000 });
    } catch (e: any) {
      toast.error(e.message || 'Şifrə yenilənmədi', { id: 'action-toast' });
    } finally {
      setSaving(null);
    }
  };

  const toggleAccordion = (key: string) => {
    setOpenAccordion(prev => prev === key ? null : key);
  };

  if (loading) {
    return (
      <div className="max-w-md space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--theme-surface)]" />
              <div className="space-y-2 flex-1">
                <div className="h-3.5 w-24 rounded-full bg-[var(--theme-surface)]" />
                <div className="h-2.5 w-36 rounded-full bg-[var(--theme-surface)]" />
              </div>
              <div className="w-6 h-6 rounded-full bg-[var(--theme-surface)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const visibleAccounts = role === 'superadmin' 
    ? accounts 
    : accounts.filter(a => a.key === role);

  return (
    <div className="max-w-md space-y-4">
      {visibleAccounts.map((account) => {
        const isOpen = openAccordion === account.key;
        const isDisabled = role !== 'superadmin' && account.key !== role;

        return (
          <div 
            key={account.key}
            className={`rounded-2xl border transition-all duration-200 ${
              isOpen ? 'border-gold/30 bg-gold/[0.02]' : 'border-[var(--theme-border)] bg-[var(--theme-surface-muted)] hover:border-[var(--theme-border-strong)]'
            }`}
          >
            <button
              onClick={() => !isDisabled && toggleAccordion(account.key)}
              disabled={isDisabled}
              className={`w-full flex items-center justify-between p-4 text-left ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl transition-colors ${isOpen ? 'bg-gold/20 text-gold' : 'bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)]'}`}>
                  {account.icon}
                </div>
                <div>
                  <p className={`text-sm font-bold ${isOpen ? 'text-gold' : 'text-[var(--theme-text)]'}`}>{account.label}</p>
                  <p className="text-[10px] text-[var(--theme-text-secondary)]">{t('click_to_change_password')}</p>
                </div>
              </div>
              <ChevronDown 
                size={18} 
                className={`text-[var(--theme-text-secondary)] transition-transform duration-200 ${isOpen ? 'rotate-180 text-gold' : ''}`} 
              />
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3">
                <div className="h-px bg-[var(--theme-border)]" />
                
                {role === 'superadmin' && (
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-gold/70 font-semibold flex items-center gap-1.5">
                      <Lock size={10} /> {t('current_password')}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword[`${account.key}_current`] ? 'text' : 'password'}
                        value={account.currentPassword}
                        onChange={(e) => updateAccountField(account.key, 'currentPassword', e.target.value)}
                        placeholder={t('current_password')}
                        className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl px-4 py-2.5 pr-10 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent-border)] focus:outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(account.key, 'current')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] transition-colors"
                      >
                        {showPassword[`${account.key}_current`] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-semibold flex items-center gap-1.5">
                    <Lock size={10} /> {t('new_password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword[`${account.key}_new`] ? 'text' : 'password'}
                      value={account.newPassword}
                      onChange={(e) => updateAccountField(account.key, 'newPassword', e.target.value)}
                      placeholder={t('new_password')}
                      className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-4 py-2.5 pr-10 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-border-strong)] focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility(account.key, 'new')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors"
                    >
                      {showPassword[`${account.key}_new`] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => savePassword(account.key)}
                  disabled={saving === account.key || !account.newPassword || (role === 'superadmin' && !account.currentPassword)}
                  className="w-full flex items-center justify-center gap-2 bg-gold text-black py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
                >
                  {saving === account.key ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {saving === account.key ? t('saving') : t('save_password')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AccountTab;
