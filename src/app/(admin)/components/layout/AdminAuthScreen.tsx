'use client';

import { Zap } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { useAdminAuth } from '../../hooks/useAdminAuth';

type AuthProps = ReturnType<typeof useAdminAuth>;

export default function AdminAuthScreen(props: AuthProps) {
  const {
    t,
    email,
    setEmail,
    password,
    setPassword,
    loading,
    errorMsg,
    needsSetup,
    setupDone,
    handleLogin,
    handleSetup,
  } = props;
  const { lightMode } = useTheme();

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center p-6 font-sans relative overflow-hidden"
      style={{ background: 'var(--theme-bg)' }}
    >
      <div
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 w-[min(500px,90vw)] h-[300px] rounded-full opacity-60"
        style={{ background: 'radial-gradient(ellipse,rgba(212,175,55,0.05) 0%,transparent 70%)' }}
      />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)] mb-5">
            <Zap size={24} className="text-gold" />
          </div>
          <h1 className="text-[28px] font-serif font-bold text-[var(--theme-text)] tracking-tight">Saito Admin</h1>
          {needsSetup ? (
            <p className="text-[var(--theme-accent)]/60 text-[11px] tracking-[0.2em] uppercase mt-1.5">İlk Qurulum</p>
          ) : (
            <p className="text-[var(--theme-text-muted)] text-[11px] tracking-[0.28em] uppercase mt-1.5">Elegance in Management</p>
          )}
        </div>

        {setupDone && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm text-center">
            Superadmin hesabı yaradıldı! İndi daxil ola bilərsiniz.
          </div>
        )}

        {needsSetup ? (
          <form noValidate onSubmit={handleSetup} className="space-y-3">
            <p className="text-[var(--theme-text-secondary)] text-xs text-center mb-4">
              Sistemdə heç bir hesab yoxdur. İlk superadmin hesabını yaradın.
            </p>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Superadmin e-poçtu"
              autoComplete="email"
              className="w-full bg-[var(--theme-panel)] border border-[var(--theme-border)] focus:border-[var(--theme-accent-border)] rounded-2xl px-5 py-4 text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none text-sm"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifrə (min. 6 simvol)"
              autoComplete="new-password"
              className="w-full bg-[var(--theme-panel)] border border-[var(--theme-border)] focus:border-[var(--theme-accent-border)] rounded-2xl px-5 py-4 text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none text-sm"
            />
            {errorMsg && (
              <p className="text-[11px] text-red-400 text-center uppercase tracking-widest pt-1">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-4 rounded-2xl font-bold tracking-[0.2em] text-sm mt-1 disabled:opacity-35 bg-[var(--theme-accent)] text-black"
              style={{ background: 'linear-gradient(135deg,var(--theme-accent),#C49A2A)', color: '#000' }}
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin-calm" />
              ) : (
                'Superadmin Yarat'
              )}
            </button>
          </form>
        ) : (
          <form noValidate onSubmit={handleLogin} className="space-y-3">
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-poçt"
              autoComplete="email"
              className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] focus:border-[var(--theme-accent-border)] rounded-2xl px-5 py-4 text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none text-sm"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifrə"
              autoComplete="current-password"
              className="w-full bg-white/[0.03] border border-white/10 focus:border-gold/40 rounded-2xl px-5 py-4 text-white placeholder:text-white/25 outline-none text-sm"
            />
            {errorMsg && (
              <p className="text-[11px] text-red-400 text-center uppercase tracking-widest pt-1">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-4 rounded-2xl font-bold tracking-[0.2em] text-sm mt-1 disabled:opacity-35 flex items-center justify-center gap-2 bg-[var(--theme-accent)] text-black"
              style={{ background: 'linear-gradient(135deg,var(--theme-accent),#C49A2A)', color: '#000' }}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin-calm" />
              ) : (
                <>
                  {t('login')} <Zap size={15} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
