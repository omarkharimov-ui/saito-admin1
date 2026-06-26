'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { Loader2, Zap, Delete } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 3 rəqəm tamamlanan kimi login-i başlat
  useEffect(() => {
    if (pin.length === 3) {
      handleLogin(pin);
    }
  }, [pin]);

  const handleLogin = async (inputPin: string) => {
    setLoading(true);
    const email = `${inputPin}@saito.az`; // Arxa planda email formatına çeviririk
    const password = inputPin; // Şifrə də PIN ilə eyni götürülür

    try {
      // 1. Supabase Auth Login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError || !authData.user) {
        toast.error('Giriş kodu yanlışdır', {
          style: { background: '#1a0a0a', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', fontWeight: 600 },
        });
        setPin(''); // PIN-i sıfırla
        return;
      }

      // 2. Rolu və icazələri yoxla
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('role')
        .ilike('email', email)
        .maybeSingle();

      if (!adminData) {
        toast.error('Bu kod üçün icazə tapılmadı');
        setPin('');
        return;
      }

      // 3. Yönləndirmə (supabase session cookie-ni avtomatik idarə edir)
      if (adminData.role === 'kitchen') {
        window.location.href = '/kitchen';
      } else {
        router.replace('/admin');
      }
    } catch (err) {
      toast.error('Giriş zamanı xəta baş verdi');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (digit: string) => {
    if (pin.length < 3 && !loading) {
      setPin(prev => prev + digit);
    }
  };

  const removeDigit = () => {
    if (!loading) setPin(prev => prev.slice(0, -1));
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1a1200 0%, #0a0a0a 60%)' }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div style={{ width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(212,175,55,0.08) 0%, transparent 70%)', marginTop: -80 }} />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xs relative z-10 flex flex-col items-center"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-16 h-16 rounded-[22px] flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg,#2a1f00,#1a1200)', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 8px 32px rgba(212,175,55,0.12)' }}>
            <Zap size={28} className="text-[#D4AF37]" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-white tracking-tight">Saito Sushi</h1>
          <p className="text-[9px] uppercase tracking-[0.4em] text-white/25 mt-1">Elegance in Management</p>
        </div>

        {/* PIN Indicators */}
        <div className="flex gap-4 mb-12">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                pin.length > i 
                  ? 'bg-gold border-gold scale-110 shadow-[0_0_15px_rgba(212,175,55,0.5)]' 
                  : 'bg-transparent border-white/10'
              }`}
            />
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-4 w-full px-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => addDigit(digit)}
              disabled={loading}
              className="aspect-square rounded-2xl flex items-center justify-center text-xl font-bold text-white/80 transition-all active:scale-90 hover:bg-white/5 border border-white/5"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              {digit}
            </button>
          ))}
          <div className="flex items-center justify-center">
            {/* Boşluq */}
          </div>
          <button
            onClick={() => addDigit('0')}
            disabled={loading}
            className="aspect-square rounded-2xl flex items-center justify-center text-xl font-bold text-white/80 transition-all active:scale-90 hover:bg-white/5 border border-white/5"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            0
          </button>
          <button
            onClick={removeDigit}
            disabled={loading}
            className="aspect-square rounded-2xl flex items-center justify-center text-white/40 transition-all active:scale-90 hover:bg-white/5"
          >
            <Delete size={20} />
          </button>
        </div>

        {loading && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-gold" size={24} />
            <p className="text-[10px] text-gold/50 uppercase tracking-widest font-bold">Yoxlanılır...</p>
          </div>
        )}
      </motion.div>

      <p className="fixed bottom-8 text-[10px] text-white/10 uppercase tracking-[0.3em]">
        Saito Sushi © 2026
      </p>
    </div>
  );
}
