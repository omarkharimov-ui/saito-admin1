'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { canonicalRole, type Role } from '@/lib/permissions';

export function useAdminAuth() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [rawRole, setRawRole] = useState<string | null>(null);
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
          const canonical = canonicalRole(me.role);
          if (canonical !== 'unknown') {
            setRawRole(me.role);
            setRole(canonical);
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
    isAuthenticated, role, rawRole, authChecked,
    loading, errorMsg,
    showWelcome, setShowWelcome,
    handleLogout,
  };
}
