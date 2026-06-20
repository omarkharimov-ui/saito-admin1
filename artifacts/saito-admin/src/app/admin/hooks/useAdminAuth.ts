import { useRouter } from 'next/navigation';
'use client';

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
      const storedRole = localStorage.getItem('saito_admin_role') as 'admin' | 'superadmin' | null;
      if (storedRole) {
        setRole(storedRole);
        setIsAuthenticated(true);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const res = await fetch('/api/auth/users');
          if (res.ok) {
            const users = await res.json();
            const me = users.find((u: { id: string }) => u.id === session.user.id);

            if (me?.role === 'admin' || me?.role === 'superadmin') {
              if (storedRole !== me.role) {
                localStorage.setItem('saito_admin_role', me.role);
              }
              setRole(me.role);
              setIsAuthenticated(true);
              setAuthChecked(true);
              return;
            }
          }
        } catch { /* network error — fall through */ }
      }

      localStorage.removeItem('saito_admin_role');
      setIsAuthenticated(false);
      setRole(null);
      setAuthChecked(true);

      try {
        const res = await fetch('/api/auth/users');
        if (res.ok) {
          const users = await res.json();
          if (users.length === 0) {
            setNeedsSetup(true);
            router.push('/admin?needsSetup=true');
          }
        }
      } catch { /* silent */ }
    };
    check();
  }, [router]);

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
      
      const userRole = data.user.role;

      if (userRole === 'kitchen') {
        await applySupabaseSession(data.session);
        document.cookie = `saito_role=kitchen; Path=/; Max-Age=86400; SameSite=Lax; ${window.location.protocol === 'https:' ? 'Secure' : ''}`;
        localStorage.setItem('saito_admin_role', 'kitchen');
        window.location.href = '/kitchen';
        return;
      }

      if (userRole === 'admin' || userRole === 'superadmin') {
        const sessionOk = await applySupabaseSession(data.session);
        if (!sessionOk) {
          setErrorMsg('Sessiya saxlanmadı. Yenidən cəhd edin.');
          setLoading(false);
          return;
        }

        document.cookie = `saito_role=${userRole}; Path=/; Max-Age=86400; SameSite=Lax; ${window.location.protocol === 'https:' ? 'Secure' : ''}`;
        localStorage.setItem('saito_admin_role', userRole);

        setRole(userRole);
        setWelcomeEmail(data.user.email || '');
        setShowWelcome(true);
        setIsAuthenticated(true);
      }
    } catch {
      setErrorMsg('Şəbəkə xətası');
    } finally {
        setLoading(false);
        setAuthChecked(true);
    }
  };

  const handleLogout = useCallback(async () => {
    localStorage.removeItem('saito_admin_role');
    document.cookie = 'saito_role=; Path=/; Max-Age=0';
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
