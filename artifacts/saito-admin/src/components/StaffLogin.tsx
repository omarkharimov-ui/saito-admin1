'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X } from 'lucide-react';

interface StaffLoginProps {
  onLogin: (data: { success: boolean; staffId: string; name: string; role: string; canonicalRole: string; shift?: string; token: string; expiresAt: string }) => void;
  returnTo?: string;
}

export function StaffLogin({ onLogin, returnTo }: StaffLoginProps) {
  const { t, language } = useLanguage();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  const submitPin = useCallback(async (p: string) => {
    if (loading || submitted || p.length < 4) return;
    setSubmitted(true);
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('wrong_pin'));
        setPin('');
        setSubmitted(false);
        return;
      }
      onLogin(data);
    } catch {
      setError(t('server_error'));
      setPin('');
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  }, [loading, submitted, onLogin, t]);

  const handleDigit = useCallback((d: string) => {
    setError('');
    setSubmitted(false);
    setPin(prev => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) {
        setTimeout(() => submitPin(next), 50);
      }
      return next;
    });
  }, [submitPin]);

  const handleBackspace = useCallback(() => {
    setError('');
    setSubmitted(false);
    setPin(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError('');
    setSubmitted(false);
    setPin('');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter' && pin.length === 4) {
        e.preventDefault();
        submitPin(pin);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDigit, handleBackspace, handleClear, submitPin, pin]);

  const digits = [
    { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' },
    { key: '4', label: '4' }, { key: '5', label: '5' }, { key: '6', label: '6' },
    { key: '7', label: '7' }, { key: '8', label: '8' }, { key: '9', label: '9' },
    { key: 'clear', label: 'C', wide: true }, { key: '0', label: '0' }, { key: 'backspace', label: '⌫', wide: true },
  ];

  const titles: Record<string, string> = {
    az: 'GİRİŞ',
    en: 'SIGN IN',
    ru: 'ВХОД',
  };
  const loginTitle = titles[language] || titles.en;

  return (
    <div className="fixed inset-0 z-[200] flex bg-neutral-950">
      {/* LEFT — Functional Login */}
      <div className="relative flex w-full lg:w-1/2 xl:w-[55%] flex-col items-center justify-center px-8">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-10">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
              <Lock size={22} className="text-white/40" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight mb-1">{loginTitle}</h1>
            <p className="text-sm text-white/30 font-medium">{t('pos_subtitle')}</p>
          </div>

          {/* PIN Dots */}
          <div className="flex items-center gap-3 mb-8">
            {[0, 1, 2, 3].map(i => (
              <motion.div
                key={i}
                animate={
                  pin.length > i
                    ? { scale: [1, 1.2, 1], opacity: [0.6, 1, 1] }
                    : { opacity: 1 }
                }
                transition={{ duration: 0.15 }}
                className={`h-2 rounded-full transition-all duration-200 ${
                  pin.length > i
                    ? 'w-8 bg-white shadow-[0_0_12px_rgba(255,255,255,0.25)]'
                    : 'w-6 bg-white/10 border border-white/10'
                }`}
              />
            ))}
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs font-bold text-red-400 mb-4 h-4"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Virtual Keyboard */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {digits.map((d, i) => {
              if (d.key === 'clear') {
                return (
                  <button
                    key={i}
                    onClick={handleClear}
                    disabled={loading || pin.length === 0}
                    className="h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-white/60 hover:bg-white/10 active:scale-95 transition-all disabled:opacity-20"
                  >
                    {d.label}
                  </button>
                );
              }
              if (d.key === 'backspace') {
                return (
                  <button
                    key={i}
                    onClick={handleBackspace}
                    disabled={loading || pin.length === 0}
                    className="h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-95 transition-all disabled:opacity-20"
                  >
                    <X size={20} />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => handleDigit(d.key)}
                  disabled={loading}
                  className="h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl font-black text-white hover:bg-white/10 active:scale-95 transition-all disabled:opacity-30"
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {/* Login Button */}
          <button
            onClick={() => submitPin(pin)}
            disabled={loading || pin.length !== 4}
            className="w-full h-14 rounded-2xl bg-white text-black font-black text-sm tracking-wide hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:active:scale-100"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                {t('checking')}...
              </span>
            ) : (
              t('pos_login') || 'DAXİL OL'
            )}
          </button>

          {/* Hint */}
          <p className="text-[10px] text-white/20 text-center mt-4 font-medium">
            {t('pos_login_keyboard_hint')}
          </p>
        </div>
      </div>

      {/* RIGHT — Restaurant Visual */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[45%] relative overflow-hidden">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-neutral-900" />

        {/* Subtle radial warmth */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(120,113,108,0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(87,83,78,0.10),transparent_50%)]" />

        {/* Fine grain / noise */}
        <div
          className="absolute inset-0 opacity-[0.25] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Top/bottom fade */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-neutral-900/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-neutral-900/60 to-transparent" />

        {/* Center content */}
        <div className="relative z-10 flex flex-col items-center justify-center px-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            className="max-w-md"
          >
            {/* Abstract restaurant mark */}
            <div className="mx-auto mb-8 h-px w-16 bg-white/10" />

            <h2 className="text-3xl font-black text-white/90 tracking-tight mb-3">
              {t('pos_login_welcome')}
            </h2>
            <p className="text-sm text-white/25 font-medium leading-relaxed">
              {t('pos_login_welcome_desc')}
            </p>

            <div className="mx-auto mt-8 h-px w-16 bg-white/10" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
