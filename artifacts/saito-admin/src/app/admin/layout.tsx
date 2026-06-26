'use client';

import dynamic from 'next/dynamic';
import { useEffect, useSyncExternalStore } from 'react';
import { NotificationProvider } from './context/NotificationContext';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { useAdminAuth } from './hooks/useAdminAuth';
import AdminLoadingScreen from './components/layout/AdminLoadingScreen';
import AdminAuthScreen from './components/layout/AdminAuthScreen';
import AdminMobileShell from './components/layout/AdminMobileShell';
import AdminDesktopShell from './components/layout/AdminDesktopShell';

function subscribe(cb: () => void) {
  const mq = window.matchMedia('(max-width: 1023px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function getSnapshot() { return window.matchMedia('(max-width: 1023px)').matches; }
function getServerSnapshot() { return false; }

function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const WelcomeScreen = dynamic(
  () => import('@/components/WelcomeScreen').then((m) => ({ default: m.WelcomeScreen })),
  { ssr: false }
);

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const auth = useAdminAuth();
  const isMobile = useIsMobile();

  useEffect(() => {
    const applyBrightness = () => {
      const h = new Date().getHours();
      const b = 1;
      document.documentElement.style.setProperty('--app-brightness', String(b));
    };
    applyBrightness();
    const id = setInterval(applyBrightness, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (isMobile) return;

    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather-check?city=Baku');
        if (!res.ok) return;
        const json = await res.json();
        if (json.condition) document.documentElement.setAttribute('data-weather', json.condition);
      } catch { /* silent */ }
    };
    fetchWeather();
    const id = setInterval(fetchWeather, 30 * 60_000);
    return () => clearInterval(id);
  }, []);

  if (!auth.authChecked) {
    return <AdminLoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return <AdminAuthScreen />;
  }

  return (
    <NotificationProvider>
      {auth.showWelcome && auth.role && auth.role !== 'cashier' && (
        <WelcomeScreen
          role={auth.role as 'superadmin' | 'admin' | 'kitchen'}
          email={auth.welcomeEmail}
          onDismiss={() => auth.setShowWelcome(false)}
        />
      )}

      {isMobile ? (
        <AdminMobileShell role={auth.role as 'admin' | 'superadmin' | null} onLogout={auth.handleLogout}>
          {children}
        </AdminMobileShell>
      ) : (
        <AdminDesktopShell role={auth.role as 'admin' | 'superadmin' | null}>{children}</AdminDesktopShell>
      )}
    </NotificationProvider>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </LanguageProvider>
    </ThemeProvider>
  );
}
