'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { Loader2, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/admin');
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    
    // 1. Auth ilə login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
      email: email.trim(), 
      password 
    });
    
    if (authError || !authData.user) {
      toast.error('E-poçt və ya şifrə yanlışdır', {
        style: { background: '#1a0a0a', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', fontWeight: 600 },
      });
      setLoading(false);
      return;
    }
    
    // 2. YOXLA: Bu user admin_users cədvəlində varmı?
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .select('id, role, email')
      .ilike('email', email.trim())
      .maybeSingle();
    
    
    if (!adminData || !['admin', 'superadmin', 'kitchen'].includes(adminData.role)) {
      toast.error('İSTİFADƏÇİ TAPILMADI', {
        style: { background: '#1a0a0a', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', fontWeight: 600 },
      });
      setLoading(false);
      return;
    }
    
    // 3. ID-lər fərqlidirsə admin_users cədvəlini yenilə
    if (adminData.id !== authData.user.id) {
      await supabase
        .from('admin_users')
        .update({ id: authData.user.id })
        .eq('email', email.trim());
    }
    
    document.cookie = `saito_role=${adminData.role}; path=/; max-age=86400`;
    document.cookie = 'isLoggedIn=true; path=/; max-age=86400';
    
    if (adminData.role === 'kitchen') {
      window.location.href = '/kitchen';
      return;
    }
    
    localStorage.setItem('isLoggedIn', 'true');
    router.replace('/admin');
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1a1200 0%, #0a0a0a 60%)' }}
    >
      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div style={{ width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(212,175,55,0.08) 0%, transparent 70%)', marginTop: -80 }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-[22px] flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg,#2a1f00,#1a1200)', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 8px 32px rgba(212,175,55,0.12)' }}>
            <Zap size={28} className="text-[#D4AF37]" />
          </div>
          <h1 className="text-[32px] font-serif font-bold text-white tracking-tight mb-1">Saito Admin</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Elegance in Management</p>
        </div>

        {/* Form */}
        <form noValidate onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            placeholder="E-poçt ünvanı"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl text-white placeholder:text-white/20 outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 16 }}
            onFocus={e => { e.currentTarget.style.border = '1px solid rgba(212,175,55,0.35)'; }}
            onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; }}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl text-white placeholder:text-white/20 outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 16 }}
            onFocus={e => { e.currentTarget.style.border = '1px solid rgba(212,175,55,0.35)'; }}
            onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; }}
          />

          <button
            type="submit"
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 mt-1"
            style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0a0a0a' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <><Zap size={14} /> Daxil ol</>}
          </button>
        </form>

        <p className="text-center text-[10px] text-white/15 uppercase tracking-[0.25em] mt-10">
          Saito Sushi © 2026
        </p>
      </motion.div>
    </div>
  );
}
