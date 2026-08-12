'use client';

import React, { useState, Suspense } from 'react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || pin.length !== 4) {
      toast.error('4 rəqəmli PIN daxil edin');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Giriş xətası');
        return;
      }
      toast.success(`Xoş gəldin, ${data.name}!`);
      const redirect = searchParams.get('redirect');
      window.location.href = redirect && redirect.startsWith('/') ? redirect : '/admin/pos';
    } catch {
      toast.error('Giriş xətası');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">İşçi Girişi</h1>
          <p className="text-white/40 text-sm mt-1">PIN kodunuzu daxil edin</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center text-2xl font-black tracking-[0.5em] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/50 transition-colors"
            placeholder="••••"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <button
            type="submit"
            disabled={loading || pin.length !== 4}
            className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-2xl text-sm uppercase tracking-widest hover:bg-[#b8941f] transition-all disabled:opacity-30 active:scale-[0.98]">
            {loading ? 'Giriş...' : 'Daxil ol'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/30 text-xs">İşçi olaraq giriş üçün admin tərəfindən verilən PIN kodu istifadə edin</p>
        </div>
      </motion.div>
    </div>
  );
}

export default function StaffLogin() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔒</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">İşçi Girişi</h1>
            <p className="text-white/40 text-sm mt-1">PIN kodunuzu daxil edin</p>
          </div>
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center text-2xl font-black tracking-[0.5em] text-white placeholder:text-white/20">
            &nbsp;
          </div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
