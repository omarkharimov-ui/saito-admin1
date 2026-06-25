'use client';

import { useRouter } from 'next/navigation';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { applySupabaseSession } from '@/lib/supabaseSession';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function useAdminAuth() {
  const { t } = useLanguage();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeEmail, setWelcomeEmail] = useState('');

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const res = await fetch('/api/auth/me'); // Server-side role check
          if (res.ok) {
            const me = await res.json();
            if (['admin', 'superadmin', 'kitchen', 'cashier'].includes(me.role)) {
              setRole(me.role);
              setIsAuthenticated(true);
              setAuthChecked(true);
              return;
            }
          }
        } catch { /* network error — fall through */ }
      }

      setIsAuthenticated(false);
      setRole(null);
      setAuthChecked(true);
    };
    check();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message === 'Invalid login credentials' ? 'E-poçt və ya şifrə yanlışdır' : error.message || 'Xəta baş verdi');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const me = await res.json();
        setRole(me.role);
        setIsAuthenticated(true);
        if (me.role === 'kitchen') {
          window.location.href = '/kitchen';
        } else {
          setWelcomeEmail(data.user?.email || '');
          setShowWelcome(true);
        }
      }
    } catch {
      setErrorMsg('Şəbəkə xətası');
    } finally {
        setLoading(false);
        setAuthChecked(true);
    }
  };

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.replace('/');
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMsg(error.message || 'Hesab yaradılarkən xəta baş verdi');
        setLoading(false);
        return;
      }
      if (!data.user) {
        setErrorMsg('Hesab yaradılmadı');
        setLoading(false);
        return;
      }
      const { error: insertError } = await supabase.from('admin_users').insert({
        id: data.user.id,
        email: email.trim(),
        role: 'superadmin',
        is_active: true,
      });
      if (insertError) {
        setErrorMsg(insertError.message || 'Admin məlumatları saxlanarkən xəta');
        setLoading(false);
        return;
      }
      setNeedsSetup(false);
      setSetupDone(true);
      setEmail('');
      setPassword('');
    } catch {
      setErrorMsg('Şəbəkə xətası');
    }
    setLoading(false);
  };

  return {
    t,
    isAuthenticated,
    role,
    authChecked,
    email,
    setEmail,
    password,
    setPassword,
    loading,
    errorMsg,
    needsSetup,
    setupDone,
    showWelcome,
    setShowWelcome,
    welcomeEmail,
    handleLogin,
    handleLogout,
    handleSetup,
  };
}
