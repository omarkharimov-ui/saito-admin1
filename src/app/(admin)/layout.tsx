'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { NotificationProvider } from './context/NotificationContext';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { useAdminAuth } from './hooks/useAdminAuth';
import AdminLoadingScreen from './components/layout/AdminLoadingScreen';
import AdminAuthScreen from './components/layout/AdminAuthScreen';
import AdminMobileShell from './components/layout/AdminMobileShell';
import AdminDesktopShell from './components/layout/AdminDesktopShell';

const WelcomeScreen = dynamic(
  () => import('@/components/WelcomeScreen').then((m) => ({ default: m.WelcomeScreen })),
  { ssr: false }
);

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const auth = useAdminAuth();

  useEffect(() => {
    const applyBrightness = () => {
      const h = new Date().getHours();
      const b = h >= 9 && h < 18 ? 1.0 : h >= 6 && h < 9 ? 0.88 : h >= 18 && h < 21 ? 0.9 : 0.78;
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
    return <AdminAuthScreen {...auth} />;
  }

  return (
    <NotificationProvider>
      {auth.showWelcome && auth.role && (
        <WelcomeScreen
          role={auth.role}
          email={auth.welcomeEmail}
          onDismiss={() => auth.setShowWelcome(false)}
        />
      )}

      <div className="lg:hidden">
        <AdminMobileShell role={auth.role} onLogout={auth.handleLogout}>
          {children}
        </AdminMobileShell>
      </div>

      <AdminDesktopShell role={auth.role}>{children}</AdminDesktopShell>
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
