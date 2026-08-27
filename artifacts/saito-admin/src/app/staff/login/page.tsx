'use client';

import { Suspense } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { StaffLogin } from '@/components/StaffLogin';

function LoginForm() {
  const { t } = useLanguage();

  const isSafeReturnTo = (value: string | null): value is string => {
    if (!value || typeof value !== 'string') return false;
    if (!value.startsWith('/')) return false;
    if (value.startsWith('//')) return false;
    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  };

  const handleLogin = (data: {
    success: boolean;
    staffId: string;
    name: string;
    role: string;
    canonicalRole: string;
    shift?: string;
    token: string;
    expiresAt: string;
  }) => {
    const rawReturnTo = new URLSearchParams(window.location.search).get('returnTo');
    const destination = isSafeReturnTo(rawReturnTo) ? rawReturnTo : '/admin/pos';
    window.location.href = destination;
  };

  return <StaffLogin onLogin={handleLogin} />;
}

export default function StaffLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
          <div className="w-full max-w-sm px-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-white/40">🔒</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">GİRİŞ</h1>
              <p className="text-white/40 text-sm mt-1">PIN kodunuzu daxil edin</p>
            </div>
            <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center text-2xl font-black tracking-[0.5em] text-white placeholder:text-white/20">
              &nbsp;
            </div>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
