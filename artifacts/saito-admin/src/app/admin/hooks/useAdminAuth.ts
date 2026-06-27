'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useAdminAuth() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<'admin' | 'superadmin' | 'kitchen' | 'cashier' | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const me = await res.json();
          if (['admin', 'superadmin', 'kitchen', 'cashier'].includes(me.role)) {
            setRole(me.role);
            setIsAuthenticated(true);
            setAuthChecked(true);
            return;
          }
        }
      } catch {}

      setIsAuthenticated(false);
      setRole(null);
      setAuthChecked(true);
    };
    check();
  }, [router]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.replace('/login');
  }, []);

  return {
    isAuthenticated, role, authChecked,
    loading, errorMsg,
    showWelcome, setShowWelcome,
    handleLogout,
  };
}
