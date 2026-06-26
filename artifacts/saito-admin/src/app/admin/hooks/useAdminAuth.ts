'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function useAdminAuth() {
  const { t } = useLanguage();
  const router = useRouter();
  
  // Müvəqqəti olaraq hamını birbaşa superadmin kimi daxil edirik (tip xətalarının qarşısını almaq üçün rolları məhdudlaşdırırıq)
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>('superadmin');
  const [authChecked, setAuthChecked] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeEmail, setWelcomeEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleLogout = useCallback(async () => {
    window.location.replace('/');
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
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
