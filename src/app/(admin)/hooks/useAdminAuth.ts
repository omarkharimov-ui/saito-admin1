'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { applySupabaseSession } from '@/lib/supabaseSession';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function useAdminAuth() {
  const { t } = useLanguage();
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
      const cookies = document.cookie.split(';').reduce<Record<string, string>>((acc, c) => {
        const [k, v] = c.trim().split('=');
        acc[k] = v;
        return acc;
      }, {});
      const cookieRole = cookies['saito_role'] as 'admin' | 'superadmin' | null;
      const isLoggedIn = cookies['isLoggedIn'] === 'true';

      // Optimistic: cookie varsa dərhal UI göstər, session-u arxa planda yoxla
      if ((cookieRole === 'admin' || cookieRole === 'superadmin') && isLoggedIn) {
        setRole(cookieRole);
        setIsAuthenticated(true);
        setAuthChecked(true);

        // Arxa planda session yoxla — etibarsızsa logout et
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          document.cookie = 'saito_role=; Path=/; Max-Age=0';
          document.cookie = 'isLoggedIn=; Path=/; Max-Age=0';
          setIsAuthenticated(false);
          setRole(null);
        }
        return;
      }

      // Cookie yoxdur — session yoxla
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const res = await fetch('/api/auth/users');
          if (res.ok) {
            const users = await res.json();
            const sessionEmail = session.user.email?.toLowerCase();
            let me = users.find((u: { id: string }) => u.id === session.user.id);
            if (!me && sessionEmail) {
              me = users.find((u: { email?: string }) => u.email?.toLowerCase() === sessionEmail);
            }
            if (me?.role === 'admin' || me?.role === 'superadmin') {
              setRole(me.role);
              setIsAuthenticated(true);
              document.cookie = `saito_role=${me.role}; Path=/; Max-Age=86400`;
              document.cookie = 'isLoggedIn=true; Path=/; Max-Age=86400';
              setAuthChecked(true);
              return;
            }
          }
        } catch { /* network error — fall through */ }
      }

      setIsAuthenticated(false);
      setRole(null);
      setAuthChecked(true);

      try {
        const res = await fetch('/api/auth/users');
        if (res.ok) {
          const users = await res.json();
          if (users.length === 0) setNeedsSetup(true);
        }
      } catch { /* silent */ }
    };
    check();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error === 'Invalid login credentials' ? 'E-poçt və ya şifrə yanlışdır' : data.error || 'Xəta baş verdi');
        setLoading(false);
        return;
      }

      if (!data.user) {
        setErrorMsg('Xəta baş verdi');
        setLoading(false);
        return;
      }

      if (data.user.role === 'kitchen') {
        await applySupabaseSession(data.session);
        const isHttps = window.location.protocol === 'https:';
        const secureFlag = isHttps ? '; Secure' : '';
        document.cookie = `saito_role=kitchen; Path=/; Max-Age=86400; SameSite=Lax${secureFlag}`;
        document.cookie = `isLoggedIn=true; Path=/; Max-Age=86400; SameSite=Lax${secureFlag}`;
        window.location.href = '/kitchen';
        return;
      }

      const sessionOk = await applySupabaseSession(data.session);
      if (!sessionOk) {
        setErrorMsg('Sessiya saxlanmadı. Yenidən cəhd edin.');
        setLoading(false);
        return;
      }

      const isHttps = window.location.protocol === 'https:';
      const secureFlag = isHttps ? '; Secure' : '';
      document.cookie = `saito_role=${data.user.role}; Path=/; Max-Age=86400; SameSite=Lax${secureFlag}`;
      document.cookie = `isLoggedIn=true; Path=/; Max-Age=86400; SameSite=Lax${secureFlag}`;
      setRole(data.user.role as 'admin' | 'superadmin');
      setWelcomeEmail(data.user.email || '');
      setShowWelcome(true);
      setIsAuthenticated(true);
      setAuthChecked(true);
    } catch {
      setErrorMsg('Şəbəkə xətası');
    }
    setLoading(false);
  };

  const handleLogout = useCallback(async () => {
    document.cookie = 'saito_role=; Path=/; Max-Age=0';
    document.cookie = 'isLoggedIn=; Path=/; Max-Age=0';
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
