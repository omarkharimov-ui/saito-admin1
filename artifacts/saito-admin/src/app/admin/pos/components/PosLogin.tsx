'use client';

import { useState, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { motion } from 'framer-motion';
import { Lock, User, X } from 'lucide-react';

interface PosLoginProps {
  onLogin: (staff: { staffId: string; name: string; role: string; shift?: string }) => void;
}

export function PosLogin({ onLogin }: PosLoginProps) {
  const { t } = useLanguage();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDigit = useCallback((d: string) => {
    setError('');
    setPin(prev => {
      if (prev.length >= 6) return prev;
      const next = prev + d;
      // Auto-submit on 4th digit
      if (next.length === 4) {
        setTimeout(() => submitPin(next), 50);
      }
      return next;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setError('');
    setPin(prev => prev.slice(0, -1));
  }, []);

  const submitPin = async (p: string) => {
    if (loading || p.length < 4) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pos/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('wrong_pin'));
        setPin('');
        return;
      }
      onLogin(data);
      // Tokeni cookie-yə yaz ki, API route-lar auth edə bilsin
      if (data.token) {
        document.cookie = `saito_token=${data.token}; path=/; max-age=${12 * 60 * 60}; SameSite=Lax`;
      }
      // CSRF token for protected API routes (transfer, delete, etc.)
      {
        const csrfToken = crypto.randomUUID();
        document.cookie = `saito_csrf=${csrfToken}; path=/; max-age=${12 * 60 * 60}; SameSite=Strict`;
      }
    } catch {
      setError(t('server_error'));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-8 w-full max-w-xs px-6"
      >
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Lock size={28} className="text-white/40" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">{t('pos_login')}</h1>
          <p className="text-xs text-white/30 font-medium">PIN daxil edin</p>
        </div>

        {/* PIN dots */}
        <div className="flex gap-3">
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              animate={pin.length > i ? { scale: [1, 1.3, 1] } : {}}
              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                pin.length > i
                  ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40'
                  : 'bg-white/10 border border-white/20'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-bold text-red-400 -mt-4"
          >
            {error}
          </motion.p>
        )}

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {digits.map((d, i) => {
            if (d === '') return <div key={i} />;
            if (d === '⌫') {
              return (
                <button
                  key={i}
                  onClick={handleBackspace}
                  className="h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-white/10 active:scale-95 transition-all"
                >
                  <X size={20} />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(d)}
                disabled={loading}
                className="h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl font-black text-white hover:bg-white/10 active:scale-95 transition-all disabled:opacity-30"
              >
                {d}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-white/30">
            <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            t('checking') + '...'
          </div>
        )}
      </motion.div>
    </div>
  );
}
